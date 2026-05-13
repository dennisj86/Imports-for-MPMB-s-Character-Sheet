import { createServer } from "node:http";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { networkInterfaces } from "node:os";

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? "0.0.0.0";
const STORE_DIR = process.env.PARTY_STORE_DIR ?? join(process.cwd(), "data", "party-sessions");
const DIST_DIR = join(process.cwd(), "dist");
const clientsByParty = new Map();

function partyFilePath(partyId) {
  return join(STORE_DIR, `${encodeURIComponent(partyId)}.json`);
}

function backupFilePath(partyId) {
  return join(STORE_DIR, `${encodeURIComponent(partyId)}.bak.json`);
}

function tempFilePath(partyId) {
  return join(STORE_DIR, `${encodeURIComponent(partyId)}.${process.pid}.tmp`);
}

function nowIso() {
  return new Date().toISOString();
}

function createEmptyBundle(partyId) {
  const now = nowIso();
  return {
    version: 1,
    party: {
      partyId,
      partyName: "Adventuring Party",
      characterIds: [],
      updatedAt: now,
      version: 1,
    },
    characters: [],
    exportedAt: now,
    storageMeta: {
      source: "shared-server",
      persisted: false,
      loadedAt: now,
    },
  };
}

async function readBundle(partyId) {
  const filePath = partyFilePath(partyId);
  try {
    const bundle = JSON.parse(await readFile(filePath, "utf8"));
    return {
      ...bundle,
      storageMeta: {
        source: "shared-server",
        persisted: true,
        loadedAt: nowIso(),
      },
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return createEmptyBundle(partyId);
    }
    const readError = new Error(`Party file for "${partyId}" is unreadable or invalid JSON.`);
    readError.status = 500;
    readError.cause = error;
    throw readError;
  }
}

async function readBundleForWrite(partyId) {
  try {
    return await readBundle(partyId);
  } catch {
    return createEmptyBundle(partyId);
  }
}

async function writeBundle(bundle) {
  await mkdir(STORE_DIR, { recursive: true });
  const partyId = bundle.party.partyId;
  const filePath = partyFilePath(partyId);
  try {
    await stat(filePath);
    await copyFile(filePath, backupFilePath(partyId));
  } catch {
    // No previous persisted party to back up.
  }
  const persistedBundle = {
    ...bundle,
    storageMeta: {
      source: "shared-server",
      persisted: true,
      loadedAt: nowIso(),
    },
  };
  const tempPath = tempFilePath(partyId);
  await writeFile(tempPath, JSON.stringify(persistedBundle, null, 2), "utf8");
  await rename(tempPath, filePath);
}

function bumpParty(party, characterIds = party.characterIds) {
  return {
    ...party,
    characterIds: Array.from(new Set(characterIds)),
    updatedAt: nowIso(),
    version: Number(party.version ?? 0) + 1,
  };
}

function bumpCharacter(character) {
  return {
    ...character,
    syncVersion: Number(character.syncVersion ?? 0) + 1,
    updatedAt: nowIso(),
  };
}

function normalizeBundle(partyId, input) {
  const characters = Array.isArray(input?.characters) ? input.characters.filter((entry) => entry?.id) : [];
  const rawParty = input?.party ?? createEmptyBundle(partyId).party;
  const characterIds = Array.from(new Set([
    ...(Array.isArray(rawParty.characterIds) ? rawParty.characterIds.filter((entry) => typeof entry === "string") : []),
    ...characters.map((entry) => entry.id),
  ]));
  return {
    version: 1,
    party: {
      ...rawParty,
      partyId,
      partyName: typeof rawParty.partyName === "string" && rawParty.partyName ? rawParty.partyName : "Adventuring Party",
      characterIds,
      updatedAt: typeof rawParty.updatedAt === "string" ? rawParty.updatedAt : nowIso(),
      version: Number.isFinite(Number(rawParty.version)) ? Number(rawParty.version) : 1,
    },
    characters,
    exportedAt: typeof input?.exportedAt === "string" ? input.exportedAt : nowIso(),
    storageMeta: {
      source: "shared-server",
      persisted: Boolean(input?.storageMeta?.persisted),
      loadedAt: nowIso(),
    },
  };
}

function mergeBundles(existing, incoming) {
  const charactersById = new Map();
  for (const character of existing.characters ?? []) {
    charactersById.set(character.id, character);
  }
  for (const character of incoming.characters ?? []) {
    charactersById.set(character.id, character);
  }
  const characterIds = Array.from(new Set([
    ...(existing.party.characterIds ?? []),
    ...(incoming.party.characterIds ?? []),
    ...(incoming.characters ?? []).map((entry) => entry.id),
  ]));
  const basePartyVersion = Math.max(Number(existing.party.version ?? 1), Number(incoming.party.version ?? 1));
  return {
    version: 1,
    party: bumpParty({
      ...existing.party,
      ...incoming.party,
      partyId: existing.party.partyId,
      version: basePartyVersion,
    }, characterIds),
    characters: characterIds.map((id) => charactersById.get(id)).filter(Boolean),
    exportedAt: nowIso(),
    storageMeta: {
      source: "shared-server",
      persisted: true,
      loadedAt: nowIso(),
    },
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function broadcast(partyId, event) {
  const clients = clientsByParty.get(partyId);
  if (!clients) {
    return;
  }
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function addSseClient(partyId, request, response) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
  response.write(`data: ${JSON.stringify({ type: "party-updated", partyId, updatedAt: nowIso(), version: 0 })}\n\n`);
  const clients = clientsByParty.get(partyId) ?? new Set();
  clients.add(response);
  clientsByParty.set(partyId, clients);
  request.on("close", () => {
    clients.delete(response);
    if (clients.size === 0) {
      clientsByParty.delete(partyId);
    }
  });
}

async function handleApi(request, response, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const partyId = decodeURIComponent(parts[2] ?? "");
  if (parts[0] !== "api" || parts[1] !== "parties" || !partyId) {
    return false;
  }

  if (parts.length === 3 && request.method === "GET") {
    sendJson(response, 200, await readBundle(partyId));
    return true;
  }

  if (parts.length === 3 && request.method === "PUT") {
    const body = await readJsonBody(request);
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const strategy = url.searchParams.get("strategy") === "replace" ? "replace" : "merge";
    const existing = await readBundleForWrite(partyId);
    const incoming = normalizeBundle(partyId, body);
    const bundle = strategy === "replace"
      ? {
        ...incoming,
        party: bumpParty({
          ...incoming.party,
          version: Math.max(Number(existing.party.version ?? 1), Number(incoming.party.version ?? 1)),
        }, incoming.party.characterIds),
        exportedAt: nowIso(),
        storageMeta: { source: "shared-server", persisted: true, loadedAt: nowIso() },
      }
      : mergeBundles(existing, incoming);
    await writeBundle(bundle);
    broadcast(partyId, { type: "party-updated", partyId, updatedAt: bundle.party.updatedAt, version: bundle.party.version });
    sendJson(response, 200, bundle);
    return true;
  }

  if (parts[3] === "events" && request.method === "GET") {
    addSseClient(partyId, request, response);
    return true;
  }

  if (parts[3] === "characters" && parts.length === 4 && request.method === "GET") {
    const bundle = await readBundle(partyId);
    sendJson(response, 200, { characters: bundle.characters ?? [] });
    return true;
  }

  if (parts[3] === "characters" && parts[4]) {
    const characterId = decodeURIComponent(parts[4]);
    const bundle = request.method === "GET" ? await readBundle(partyId) : await readBundleForWrite(partyId);
    const existing = (bundle.characters ?? []).find((entry) => entry.id === characterId);

    if (parts.length === 5 && request.method === "GET") {
      if (!existing) {
        sendJson(response, 404, { error: "Character not found" });
        return true;
      }
      sendJson(response, 200, existing);
      return true;
    }

    if (parts.length === 5 && request.method === "PUT") {
      const incoming = await readJsonBody(request);
      const character = bumpCharacter({ ...incoming, id: characterId });
      const others = (bundle.characters ?? []).filter((entry) => entry.id !== characterId);
      const next = {
        ...bundle,
        party: bumpParty(bundle.party, [...(bundle.party.characterIds ?? []), characterId]),
        characters: [...others, character],
        exportedAt: nowIso(),
      };
      await writeBundle(next);
      broadcast(partyId, { type: "character-updated", partyId, characterId, updatedAt: character.updatedAt, version: character.syncVersion });
      sendJson(response, 200, character);
      return true;
    }

    if (parts.length === 6 && parts[5] === "play-state" && request.method === "PATCH") {
      if (!existing) {
        sendJson(response, 404, { error: "Character not found" });
        return true;
      }
      const body = await readJsonBody(request);
      const character = bumpCharacter({ ...existing, playState: body?.playState });
      const next = {
        ...bundle,
        party: bumpParty(bundle.party),
        characters: (bundle.characters ?? []).map((entry) => entry.id === characterId ? character : entry),
        exportedAt: nowIso(),
      };
      await writeBundle(next);
      broadcast(partyId, { type: "character-updated", partyId, characterId, updatedAt: character.updatedAt, version: character.syncVersion });
      sendJson(response, 200, character);
      return true;
    }
  }

  return false;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function serveStatic(request, response, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(DIST_DIR, requestPath));
  if (!filePath.startsWith(DIST_DIR)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }
    response.writeHead(200, { "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    createReadStream(join(DIST_DIR, "index.html")).pipe(response);
  }
}

function printAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(`http://${entry.address}:${PORT}`);
      }
    }
  }
  console.log(`Party server listening on http://localhost:${PORT}`);
  for (const address of addresses) {
    console.log(`LAN: ${address}`);
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url.pathname);
      if (!handled) {
        sendJson(response, 404, { error: "Not found" });
      }
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    sendJson(response, error?.status ?? 500, { error: error instanceof Error ? error.message : "Server error" });
  }
});

await mkdir(STORE_DIR, { recursive: true });
server.listen(PORT, HOST, printAddresses);
