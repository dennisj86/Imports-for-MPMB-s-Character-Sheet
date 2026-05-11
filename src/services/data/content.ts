import rawContent from "./generated/mpmb-content.json";
import { contentSnapshotSchema } from "./schemas";
import { applyManualOverrides } from "./manualOverrides";

const parsedSnapshot = contentSnapshotSchema.parse(rawContent);
export const contentSnapshot = contentSnapshotSchema.parse(applyManualOverrides(parsedSnapshot));
