# Imports for MPMB's Character Sheet
This git repository holds different fan-created materials that can be used with **MorePurpleMoreBetter's D&D 5e Character Record Sheet**. The repository for the sheet is [found on MPMB's GitHub](https://github.com/morepurplemorebetter/MPMBs-Character-Record-Sheet).

You can get the sheet for free on [MPMB's website](https://www.flapkan.com/#download).

&nbsp;

## Join the discussion
Questions or remarks are best made on the MPMB [Discord server](https://discord.gg/P6drkuk9bt) or the [subreddit](https://www.reddit.com/r/mpmb/).

&nbsp;

## How to use
To get all the non-duplicate WotC content, all you need is the **all_WotC** files from a [release](../../releases). Be aware that the files above might be for a version of MPMB's that is still under development.

1. Download the latest version of the PDF from [MPMB's website](https://www.flapkan.com/#download).
2. [Click here](https://github.com/safety-orange/Imports-for-MPMB-s-Character-Sheet/releases/latest/download/all_WotC_pub+UA.min.js) to download the latest all_WotC_pub+UA.min.js release, and save it somewhere on your machine.
3. Open the PDF and click on the bookmark **Functions** >> **Add Extra Materials**.
4. From the menu that appears, select the option **Import a file with additional material**.
5. In the dialog that opens, click **Add file**, and open the file you saved in step 1.
6. Click **Apply changes** in the Import Files dialog and the sheet will process the file you added. You will get a pop-up message if it was successful or not.

MPMB has a more flashy explanation, along with a video, on how to do this in [this how-to guide on his website](https://www.flapkan.com/how-to/add-more-content).

&nbsp;

## Local Character Builder MVP (Phase 1)

This repository now also contains a local React/TypeScript MVP app for a D&D character builder that reads normalized declarative data from the existing import scripts.

### Start
```sh
npm install
npm run dev
```

The app runs via Vite (default: http://localhost:5173).

### Validation
```sh
npm run typecheck
npm run test
npm run build
```

### Data Ingestion
The app does not import MPMB scripts directly in the browser. Instead, a local ingestion script executes selected source files in a controlled sandbox and writes:

`src/services/data/generated/mpmb-content.json`

Run manually if needed:
```sh
npm run data:generate
```

The ingestion step intentionally ignores imperative MPMB hooks and keeps only declarative fields for the MVP.

Runtime diagnostics for the local MPMB generation are written to:
- `data/imports/mpmb-local/manifests/latest-runtime-diagnostics.json`
- `data/imports/mpmb-local/manifests/latest-runtime-summary.json`

These include parse/runtime errors, shim usage, registry fallback usage, load-order buckets, and regression checks.

### Open5e API V2 Ingestion (Additive)
Open5e is integrated as an additive ingestion source. The pipeline uses Open5e API V2 only (no HTML scraping).

Commands:
```sh
npm run import:open5e:2014
npm run import:open5e:2024
npm run import:open5e:both
```

Each import run fetches, normalizes, and stores artifacts in:
- `data/imports/open5e/raw/`
- `data/imports/open5e/normalized/`
- `data/imports/open5e/manifests/`

The importer also updates the merged app snapshot:
- `src/services/data/generated/mpmb-content.json`

Local generation stays available:
```sh
npm run data:generate
```
If a normalized Open5e artifact exists, `data:generate` merges it additively with local MPMB-normalized data.

### MPMB PDF Ingestion (Additive, Reproducible)
The project can ingest base declarative registries from `docs/DnD.pdf` (no OCR, no HTML scraping) as a second provider (`mpmb`).

Commands:
```sh
npm run import:mpmb-pdf:raw
npm run import:mpmb-pdf:normalize
npm run import:mpmb-pdf
```

What these do:
- `raw`: extract JavaScript sections from the PDF and write raw manifests/scripts
- `normalize`: execute capture sandbox, normalize registries into app schema, refresh merged snapshot
- `import:mpmb-pdf`: run `raw + normalize` in one step

Artifacts:
- `data/imports/mpmb-pdf/raw/`
- `data/imports/mpmb-pdf/normalized/`
- `data/imports/mpmb-pdf/manifests/`

The merged app snapshot remains:
- `src/services/data/generated/mpmb-content.json`

### Source Selection in UI
- Open `Content` in the app.
- Use the **Data Sources** panel to pick presets (e.g. Official Handbooks) or individual books/sources.
- You can now scope by provider via presets (`Provider: MPMB` / `Provider: Open5e`).
- Presets include Open5e source sets (`Open5e 2014`, `Open5e 2024`, `Open5e 2014+2024`) once imported.
- Presets include `MPMB PDF Core` for the PDF-derived source keys.
- Click **Regenerate** to reload the active in-app catalog from the selected sources.
- The selection is persisted locally for the next app start.
- `Outlander / Wanderer` is primarily expected from native imported/generated data; manual fallback is only injected when no native Outlander/Wanderer entry exists.

&nbsp;

## Different Versions
The code above is under development, [see releases](../../releases) for the latest stable build. It is updated along with the development of MPMB's Character Record Sheet and thus might be ahead of the latest stable version of MPMB's.

In [releases](../../releases) you can find the files for the latest version of MPMB's Character Record Sheet as well as for older versions (v13.1.13 or later).

If you are looking for versions before v13.1.13, see [tags](../../releases).

Be aware that this content is for the 5th edition of Dungeon & Dragons (2014).

&nbsp;

## Concatenation and Minification

### Setup
Ensure you have `node` and `npm` installed, then:
```sh
npm install
```

### Use
To minify run one of these three commands:
```sh
# For all (stable and beta)
npm run minify
# Just stable
npm run minifyStable
# Just beta
npm run minifyBeta
```
