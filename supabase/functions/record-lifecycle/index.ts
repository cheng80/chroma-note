const URL = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
const SECRET = Deno.env.get("SUPABASE_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLEANUP_SECRET = Deno.env.get("RECORD_CLEANUP_SECRET") ?? "";
const BUCKET = "stamp-images";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 2048;
const MAX_JSON_DEPTH = 8;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const BEGIN_KEYS = new Set([
  "diary_date",
  "date_source",
  "place_name",
  "user_note",
  "scene",
  "semantic_tags",
  "mood_tags",
  "ai_field_note",
  "ai_field_note_edited",
  "is_favorite",
  "color_tags",
  "analysis_meta",
  "model_meta",
  "style_meta",
  "stamp",
]);
const EDIT_KEYS = new Set([
  "diary_date",
  "date_source",
  "place_name",
  "user_note",
  "scene",
  "semantic_tags",
  "mood_tags",
  "ai_field_note_edited",
  "is_favorite",
]);
const ANALYSIS_EDIT_KEYS = new Set([
  "scene",
  "semantic_tags",
  "mood_tags",
  "ai_field_note_edited",
]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RequestBody = {
  action?: string;
  record_id?: string;
  operation_id?: string;
  payload_hash?: string;
  payload?: Json;
  base_version?: number;
  limit?: number;
};

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public currentVersion?: number,
  ) {
    super(message);
  }
}

function response(body: Json, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function fail(error: unknown) {
  if (error instanceof HttpError) {
    return response({
      error: {
        code: error.code,
        message: error.message,
        ...(error.currentVersion === undefined
          ? {}
          : { current_version: error.currentVersion }),
      },
    }, error.status);
  }
  console.error("record lifecycle failure");
  return response({
    error: { code: "internal", message: "The record operation failed." },
  }, 500);
}

function object(value: unknown): value is Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, Json>,
  allowed: Set<string>,
  required = allowed,
) {
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    [...required].some((key) => !(key in value))
  ) {
    throw new HttpError(400, "validation", "Payload fields are invalid.");
  }
}

function text(value: Json | undefined, maximum: number, nullable = false) {
  if (nullable && value === null) return;
  if (
    typeof value !== "string" || [...value].length > maximum ||
    value !== value.normalize("NFC")
  ) {
    throw new HttpError(
      400,
      "validation",
      "Text fields must be NFC and within their limits.",
    );
  }
}

function tags(value: Json | undefined, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new HttpError(400, "validation", "Tags are invalid.");
  }
  const seen = new Set<string>();
  for (const tag of value) {
    text(tag, 24);
    if (!(tag as string).trim() || seen.has(tag as string)) {
      throw new HttpError(400, "validation", "Tags are invalid.");
    }
    seen.add(tag as string);
  }
}

function date(value: Json | undefined) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "validation", "diary_date is invalid.");
  }
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    throw new HttpError(400, "validation", "diary_date is invalid.");
  }
}

function colors(value: Json | undefined) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new HttpError(400, "validation", "color_tags are invalid.");
  }
  let total = 0;
  for (const item of value) {
    if (!object(item)) {
      throw new HttpError(400, "validation", "color_tags are invalid.");
    }
    exactKeys(
      item,
      new Set(["hex", "rgb", "weight", "color_name_key"]),
      new Set(["hex", "rgb", "weight"]),
    );
    if (
      typeof item.hex !== "string" || !/^#[0-9A-F]{6}$/.test(item.hex) ||
      !Array.isArray(item.rgb) || item.rgb.length !== 3 ||
      item.rgb.some((channel) =>
        !Number.isInteger(channel) || (channel as number) < 0 ||
        (channel as number) > 255
      ) ||
      typeof item.weight !== "number" || !Number.isFinite(item.weight) ||
      item.weight <= 0 || item.weight > 1
    ) {
      throw new HttpError(400, "validation", "color_tags are invalid.");
    }
    const expected = `#${
      item.rgb.map((channel) =>
        (channel as number).toString(16).padStart(2, "0")
      ).join("").toUpperCase()
    }`;
    if (item.hex !== expected) {
      throw new HttpError(400, "validation", "color_tags are invalid.");
    }
    if ("color_name_key" in item) text(item.color_name_key, 120);
    total += item.weight;
  }
  if (Math.abs(total - 1) > 0.001) {
    throw new HttpError(400, "validation", "color_tags weights must total 1.");
  }
}

function safeJson(value: Json | undefined, name: string) {
  if (
    !object(value) ||
    new TextEncoder().encode(JSON.stringify(value)).length > 16 * 1024
  ) {
    throw new HttpError(400, "validation", `${name} is invalid.`);
  }
  const forbidden =
    /(^|_)(uri|url|path|token|secret|authorization|image|photo|hash)$/i;
  const walk = (entry: Json, depth: number) => {
    if (depth > 5) {
      throw new HttpError(400, "validation", `${name} is too deeply nested.`);
    }
    if (typeof entry === "number" && !Number.isFinite(entry)) {
      throw new HttpError(400, "validation", `${name} is invalid.`);
    }
    if (typeof entry === "string" && entry !== entry.normalize("NFC")) {
      throw new HttpError(400, "validation", `${name} must use NFC text.`);
    }
    if (Array.isArray(entry)) entry.forEach((child) => walk(child, depth + 1));
    else if (object(entry)) {
      for (const [key, child] of Object.entries(entry)) {
        if (forbidden.test(key)) {
          throw new HttpError(
            400,
            "validation",
            `${name} contains a forbidden field.`,
          );
        }
        walk(child, depth + 1);
      }
    }
  };
  walk(value, 0);

  const allowed: Record<string, Set<string>> = {
    analysis_meta: new Set([
      "schema_version",
      "status",
      "ai_scene",
      "ai_tags",
      "ai_mood",
      "language",
      "user_modified_fields",
    ]),
    model_meta: new Set(["source_revision", "vlm", "line"]),
    style_meta: new Set([
      "style_id",
      "line_model_style",
      "max_edge",
      "mask_gain",
      "background",
      "postprocess_version",
      "input_dimensions",
      "output_dimensions",
      "fit",
      "padding",
    ]),
  };
  const required: Record<string, Set<string>> = {
    analysis_meta: new Set([
      "schema_version",
      "status",
      "ai_scene",
      "ai_tags",
      "ai_mood",
      "language",
      "user_modified_fields",
    ]),
    model_meta: new Set(["source_revision", "line"]),
    style_meta: new Set([
      "style_id",
      "line_model_style",
      "max_edge",
      "mask_gain",
      "background",
      "postprocess_version",
      "input_dimensions",
      "output_dimensions",
      "fit",
    ]),
  };
  exactKeys(value, allowed[name], required[name]);
  if (name === "analysis_meta") {
    if (
      value.schema_version !== 1 ||
      !["success", "skipped"].includes(String(value.status)) ||
      !["ko", "en"].includes(String(value.language))
    ) {
      throw new HttpError(400, "validation", "analysis_meta is invalid.");
    }
    text(value.ai_scene, 120, true);
    tags(value.ai_tags, 8);
    tags(value.ai_mood, 3);
    const modified = value.user_modified_fields;
    if (!Array.isArray(modified) || modified.length > ANALYSIS_EDIT_KEYS.size ||
      modified.some((field) => typeof field !== "string" || !ANALYSIS_EDIT_KEYS.has(field)) ||
      new Set(modified).size !== modified.length) {
      throw new HttpError(400, "validation", "analysis_meta is invalid.");
    }
  }
  if (name === "model_meta") {
    const componentKeys = new Set([
      "model_id",
      "revision",
      "runtime_version",
      "quantization",
      "prompt_version",
      "inference_duration_ms",
    ]);
    for (const key of ["vlm", "line"]) {
      if (value[key] !== undefined && value[key] !== null) {
        if (!object(value[key])) {
          throw new HttpError(400, "validation", "model_meta is invalid.");
        }
        exactKeys(
          value[key] as Record<string, Json>,
          componentKeys,
          key === "line"
            ? new Set(["model_id", "revision", "runtime_version", "quantization", "inference_duration_ms"])
            : new Set(["model_id"]),
        );
        const component = value[key] as Record<string, Json>;
        if (
          component.model_id !== undefined &&
            typeof component.model_id !== "string" ||
          component.revision !== undefined &&
            typeof component.revision !== "string" ||
          component.runtime_version !== undefined &&
            typeof component.runtime_version !== "string" ||
          component.quantization !== undefined &&
            typeof component.quantization !== "string" ||
          component.prompt_version !== undefined &&
            typeof component.prompt_version !== "string" ||
          component.inference_duration_ms !== undefined &&
            (!Number.isInteger(component.inference_duration_ms) ||
              (component.inference_duration_ms as number) < 0)
        ) {
          throw new HttpError(400, "validation", "model_meta is invalid.");
        }
        for (const field of ["model_id", "revision", "runtime_version", "quantization", "prompt_version"]) {
          if (component[field] !== undefined) {
            text(component[field], 120);
            if (!(component[field] as string).trim()) {
              throw new HttpError(400, "validation", "model_meta is invalid.");
            }
          }
        }
      }
    }
    if (
      !Number.isInteger(value.source_revision) ||
      (value.source_revision as number) < 1
    ) throw new HttpError(400, "validation", "model_meta is invalid.");
  }
  if (name === "style_meta") {
    if (
      value.style_id !== "ink-v1" ||
      value.line_model_style !== "style1" ||
      !Number.isInteger(value.max_edge) || (value.max_edge as number) < 16 ||
      (value.max_edge as number) > 1536 ||
      typeof value.mask_gain !== "number" || !Number.isFinite(value.mask_gain) ||
      value.mask_gain < 0.1 || value.mask_gain > 4 ||
      value.background !== "white" ||
      !dimensions(value.input_dimensions) ||
      !dimensions(value.output_dimensions) ||
      value.fit !== "contain" ||
      typeof value.postprocess_version !== "string" || !value.postprocess_version ||
      value.padding !== undefined &&
        (!Array.isArray(value.padding) || value.padding.length !== 4 ||
          value.padding.some((part) =>
            !Number.isInteger(part) || (part as number) < 0
          ))
    ) {
      throw new HttpError(400, "validation", "style_meta is invalid.");
    }
  }
}

function dimensions(value: Json) {
  return Array.isArray(value) && value.length === 2 &&
    value.every((part) =>
      Number.isInteger(part) && (part as number) > 0 &&
      (part as number) <= MAX_SIDE
    );
}

function validateFields(payload: Record<string, Json>, edit: boolean) {
  exactKeys(
    payload,
    edit ? EDIT_KEYS : BEGIN_KEYS,
    edit ? new Set() : BEGIN_KEYS,
  );
  if ("diary_date" in payload) date(payload.diary_date);
  if (
    "date_source" in payload &&
    !["exif", "device", "user"].includes(String(payload.date_source))
  ) throw new HttpError(400, "validation", "date_source is invalid.");
  if ("place_name" in payload) text(payload.place_name, 120, true);
  if ("user_note" in payload) text(payload.user_note, 2000);
  if ("scene" in payload) text(payload.scene, 120, true);
  if ("semantic_tags" in payload) tags(payload.semantic_tags, 8);
  if ("mood_tags" in payload) tags(payload.mood_tags, 3);
  if (!edit && "ai_field_note" in payload) {
    text(payload.ai_field_note, 300, true);
  }
  if ("ai_field_note_edited" in payload) {
    text(payload.ai_field_note_edited, 300, true);
  }
  if ("is_favorite" in payload && typeof payload.is_favorite !== "boolean") {
    throw new HttpError(400, "validation", "is_favorite is invalid.");
  }
  if (edit) {
    if (!Object.keys(payload).length) {
      throw new HttpError(
        400,
        "validation",
        "At least one editable field is required.",
      );
    }
    return;
  }
  colors(payload.color_tags);
  for (const name of ["analysis_meta", "model_meta", "style_meta"]) {
    safeJson(payload[name], name);
  }
  if (
    new TextEncoder().encode(
      JSON.stringify([
        payload.analysis_meta,
        payload.model_meta,
        payload.style_meta,
      ]),
    ).length > 16 * 1024
  ) {
    throw new HttpError(400, "validation", "Combined metadata is too large.");
  }
  if (!object(payload.stamp)) {
    throw new HttpError(400, "validation", "stamp is invalid.");
  }
  exactKeys(payload.stamp, new Set(["sha256", "bytes", "width", "height"]));
  if (
    typeof payload.stamp.sha256 !== "string" ||
    !HASH.test(payload.stamp.sha256) ||
    !Number.isInteger(payload.stamp.bytes) ||
    (payload.stamp.bytes as number) < 1 ||
    (payload.stamp.bytes as number) > MAX_BYTES ||
    !Number.isInteger(payload.stamp.width) ||
    (payload.stamp.width as number) < 1 ||
    (payload.stamp.width as number) > MAX_SIDE ||
    !Number.isInteger(payload.stamp.height) ||
    (payload.stamp.height as number) < 1 ||
    (payload.stamp.height as number) > MAX_SIDE
  ) {
    throw new HttpError(400, "validation", "stamp descriptor is invalid.");
  }
  const analysis = payload.analysis_meta as Record<string, Json>;
  const model = payload.model_meta as Record<string, Json>;
  const style = payload.style_meta as Record<string, Json>;
  if (
    analysis.status === "success" && !object(model.vlm) ||
    analysis.status === "skipped" && model.vlm !== undefined ||
    !Array.isArray(style.output_dimensions) ||
    style.output_dimensions[0] !== payload.stamp.width ||
    style.output_dimensions[1] !== payload.stamp.height ||
    Math.max(...style.output_dimensions as number[]) > (style.max_edge as number)
  ) {
    throw new HttpError(400, "validation", "Processing metadata is inconsistent.");
  }
}

function canonical(value: Json, depth = 0): string {
  if (depth > MAX_JSON_DEPTH) {
    throw new HttpError(400, "validation", "Payload is too deeply nested.");
  }
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`;
  }
  return `{${
    Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`
    ).join(",")
  }}`;
}

async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const copy = Uint8Array.from(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeJwt(token: string): Record<string, Json> {
  try {
    const raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")));
  } catch {
    throw new HttpError(401, "unauthorized", "Invalid access token.");
  }
}

async function authenticate(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!token || !URL || !SECRET) {
    throw new HttpError(401, "unauthorized", "Authentication is required.");
  }
  const auth = await fetch(`${URL}/auth/v1/user`, {
    headers: { ...adminHeaders(), Authorization: `Bearer ${token}` },
  });
  if (!auth.ok) {
    throw new HttpError(
      401,
      "unauthorized",
      "The access token is invalid or expired.",
    );
  }
  const user = await auth.json();
  const claims = decodeJwt(token);
  if (
    !UUID.test(user.id) || claims.sub !== user.id ||
    !UUID.test(String(claims.session_id)) || claims.is_anonymous === true
  ) {
    throw new HttpError(
      401,
      "unauthorized",
      "The authenticated session is invalid.",
    );
  }
  return {
    userId: user.id as string,
    sessionId: claims.session_id as string,
    claims,
  };
}

function authenticateCleanup(request: Request) {
  const supplied = request.headers.get("x-record-cleanup-secret") ?? "";
  const left = new TextEncoder().encode(supplied);
  const right = new TextEncoder().encode(CLEANUP_SECRET);
  if (!CLEANUP_SECRET || left.length !== right.length) {
    throw new HttpError(401, "unauthorized", "Cleanup authentication failed.");
  }
  let different = 0;
  for (let index = 0; index < left.length; index++) different |= left[index] ^ right[index];
  if (different !== 0) throw new HttpError(401, "unauthorized", "Cleanup authentication failed.");
}

async function rpc(name: string, body: Record<string, unknown>) {
  const result = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...adminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    throw new HttpError(
      503,
      "backend_unavailable",
      "The record service is unavailable.",
    );
  }
  return await result.json();
}

function adminHeaders() {
  return {
    apikey: SECRET,
    ...(SECRET.startsWith("sb_secret_")
      ? {}
      : { Authorization: `Bearer ${SECRET}` }),
  };
}

async function boundedBytes(
  stream: ReadableStream<Uint8Array> | null,
  maximum: number,
) {
  if (!stream) {
    throw new HttpError(400, "validation", "Request body is required.");
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) {
        throw new HttpError(
          413,
          "payload_too_large",
          "Decoded data is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function rpcError(result: Record<string, Json>) {
  if (result.ok === true) return;
  const error = object(result.error) ? result.error : {};
  const code = typeof error.code === "string" ? error.code : "conflict";
  const statuses: Record<string, number> = {
    validation: 400,
    unauthorized: 401,
    account_locked: 423,
    not_found: 404,
    conflict: 409,
    version_conflict: 409,
  };
  throw new HttpError(
    statuses[code] ?? 409,
    code,
    typeof error.message === "string" ? error.message : "Record conflict.",
    typeof error.current_version === "number"
      ? error.current_version
      : undefined,
  );
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(typeAndData: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of typeAndData) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function validatePng(bytes: Uint8Array, expected: Record<string, Json>) {
  if (
    bytes.length > MAX_BYTES || bytes.length !== expected.bytes ||
    await sha256(bytes) !== expected.sha256
  ) {
    throw new HttpError(
      422,
      "invalid_image",
      "PNG bytes or checksum do not match the reservation.",
    );
  }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => bytes[index] === byte)) {
    throw new HttpError(
      422,
      "invalid_image",
      "The uploaded file is not a PNG.",
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8,
    width = 0,
    height = 0,
    bitDepth = 0,
    colorType = -1,
    interlace = -1,
    sawIhdr = false,
    sawIend = false;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > MAX_BYTES || offset + 12 + length > bytes.length) {
      throw new HttpError(422, "invalid_image", "PNG chunks are truncated.");
    }
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = new TextDecoder("ascii", { fatal: true }).decode(typeBytes);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
        view.getUint32(offset + 8 + length)
    ) {
      throw new HttpError(422, "invalid_image", "PNG checksum is invalid.");
    }
    if (!sawIhdr && type !== "IHDR") {
      throw new HttpError(422, "invalid_image", "PNG header is missing.");
    }
    if (type === "IHDR") {
      if (sawIhdr || length !== 13) {
        throw new HttpError(422, "invalid_image", "PNG header is invalid.");
      }
      sawIhdr = true;
      width = new DataView(chunk.buffer, chunk.byteOffset, 13).getUint32(0);
      height = new DataView(chunk.buffer, chunk.byteOffset, 13).getUint32(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
      if (
        ![2, 6].includes(colorType) || bitDepth !== 8 || chunk[10] !== 0 ||
        chunk[11] !== 0 || interlace !== 0 || width < 1 || height < 1 ||
        width > MAX_SIDE || height > MAX_SIDE
      ) {
        throw new HttpError(
          422,
          "invalid_image",
          "PNG encoding or dimensions are unsupported.",
        );
      }
    } else if (type === "IDAT") idat.push(chunk);
    else if (type === "acTL" || type === "fcTL" || type === "fdAT") {
      throw new HttpError(422, "invalid_image", "Animated PNG is not allowed.");
    } else if (type === "IEND") {
      if (length !== 0) {
        throw new HttpError(422, "invalid_image", "PNG end marker is invalid.");
      }
      sawIend = true;
      offset += 12;
      break;
    }
    offset += 12 + length;
  }
  if (
    !sawIhdr || !sawIend || offset !== bytes.length || !idat.length ||
    width !== expected.width || height !== expected.height
  ) {
    throw new HttpError(
      422,
      "invalid_image",
      "PNG structure or dimensions do not match the reservation.",
    );
  }
  const compressed = new Uint8Array(
    idat.reduce((sum, part) => sum + part.length, 0),
  );
  let cursor = 0;
  for (const part of idat) {
    compressed.set(part, cursor);
    cursor += part.length;
  }
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const rowBytes = Math.ceil(width * channels[colorType] * bitDepth / 8);
  const expectedDecoded = (rowBytes + 1) * height;
  if (expectedDecoded > 32 * 1024 * 1024) {
    throw new HttpError(422, "invalid_image", "Decoded PNG is too large.");
  }
  let decoded: Uint8Array;
  try {
    decoded = await boundedBytes(
      new Blob([compressed]).stream().pipeThrough(
        new DecompressionStream("deflate"),
      ),
      expectedDecoded,
    );
  } catch (error) {
    if (error instanceof HttpError) {
      throw new HttpError(
        422,
        "invalid_image",
        "Decoded PNG exceeds its safe limit.",
      );
    }
    throw new HttpError(
      422,
      "invalid_image",
      "PNG pixel data cannot be decoded.",
    );
  }
  if (decoded.length !== expectedDecoded) {
    throw new HttpError(
      422,
      "invalid_image",
      "PNG pixel data length is invalid.",
    );
  }
  for (let row = 0; row < height; row++) {
    if (decoded[row * (rowBytes + 1)] > 4) {
      throw new HttpError(
        422,
        "invalid_image",
        "PNG scanline filter is invalid.",
      );
    }
  }
  return { width, height };
}

async function storage(path: string, method: "GET" | "DELETE") {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/stamp\.png$/i.test(path)) {
    throw new HttpError(500, "internal", "Invalid storage path.");
  }
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const result = await fetch(
    `${URL}/storage/v1/object/${BUCKET}${method === "GET" ? `/${encodedPath}` : ""}`,
    {
      method,
      headers: {
        ...adminHeaders(),
        ...(method === "DELETE" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "DELETE"
        ? JSON.stringify({ prefixes: [path] })
        : undefined,
    },
  );
  if (method === "DELETE" && result.status === 404) return null;
  if (!result.ok) {
    const errorBody = await result.json().catch(() => null) as Json;
    const missing = result.status === 404 ||
      (result.status === 400 && object(errorBody) &&
        (String(errorBody.statusCode) === "404" ||
          errorBody.code === "NoSuchKey"));
    throw new HttpError(
      method === "GET" && missing ? 422 : 503,
      method === "GET" && missing ? "invalid_image" :
        method === "GET" ? "backend_unavailable" : "cleanup_pending",
      method === "GET"
        ? missing
          ? "The reserved PNG was not uploaded."
          : "Image verification is temporarily unavailable."
        : "Image cleanup is pending.",
    );
  }
  if (method === "DELETE") return null;
  if (!result.headers.get("content-type")?.toLowerCase().startsWith("image/png")) {
    throw new HttpError(422, "invalid_image", "The uploaded object is not a PNG.");
  }
  const length = Number(result.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) {
    throw new HttpError(422, "invalid_image", "The uploaded PNG is too large.");
  }
  try {
    return await boundedBytes(result.body, MAX_BYTES);
  } catch (error) {
    if (error instanceof HttpError) {
      throw new HttpError(422, "invalid_image", "The uploaded PNG is too large.");
    }
    throw error;
  }
}

async function transaction(
  action: string,
  auth: { userId: string; sessionId: string },
  body: RequestBody,
  payload: Json,
) {
  const result = await rpc("record_lifecycle_transaction", {
    p_action: action,
    p_user_id: auth.userId,
    p_session_id: auth.sessionId,
    p_record_id: body.record_id ?? null,
    p_operation_id: body.operation_id,
    p_payload_hash: body.payload_hash,
    p_payload: payload,
    p_base_version: body.base_version ?? null,
  });
  rpcError(result);
  return result as Record<string, Json>;
}

async function cleanup(limit: number) {
  let cleaned = 0;
  while (cleaned < limit) {
    const claimed = await rpc("record_lifecycle_admin", {
      p_action: "claim_cleanup",
      p_user_id: null,
      p_record_id: null,
    });
    rpcError(claimed);
    if (!object(claimed.record)) break;
    const record = claimed.record as Record<string, Json>;
    const path = `${record.user_id}/${record.id}/stamp.png`;
    if (record.stamp_image_path !== path) {
      throw new HttpError(500, "internal", "The cleanup path is invalid.");
    }
    await storage(path, "DELETE");
    const purged = await rpc("record_lifecycle_admin", {
      p_action: "purge_record",
      p_user_id: record.user_id,
      p_record_id: record.id,
    });
    rpcError(purged);
    cleaned++;
  }
  return response({ cleaned });
}

async function handler(request: Request) {
  if (request.method !== "POST") {
    throw new HttpError(405, "method_not_allowed", "Use POST.");
  }
  if ((Number(request.headers.get("content-length")) || 0) > 64 * 1024) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }
  let body: RequestBody;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await boundedBytes(request.body, 64 * 1024),
      ),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "validation", "A valid JSON body is required.");
  }
  if (!object(body as unknown as Json)) {
    throw new HttpError(400, "validation", "JSON body is required.");
  }
  if (body.action === "cleanup") {
    exactKeys(body as unknown as Record<string, Json>, new Set(["action", "limit"]), new Set(["action"]));
    if (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 20)) {
      throw new HttpError(400, "validation", "cleanup limit is invalid.");
    }
    authenticateCleanup(request);
    return cleanup(body.limit ?? 10);
  }
  exactKeys(
    body as unknown as Record<string, Json>,
    new Set([
      "action",
      "record_id",
      "operation_id",
      "payload_hash",
      "payload",
      "base_version",
    ]),
    new Set(["action", "operation_id", "payload_hash"]),
  );
  const action = body.action;
  if (
    !["begin", "finalize", "edit", "delete", "abort"]
      .includes(String(action)) ||
    !UUID.test(String(body.operation_id)) ||
    !HASH.test(String(body.payload_hash))
  ) {
    throw new HttpError(
      400,
      "validation",
      "Lifecycle identifiers are invalid.",
    );
  }
  const payload = body.payload ?? {};
  if (!object(payload)) {
    throw new HttpError(400, "validation", "payload must be an object.");
  }
  if (
    !["finalize", "abort"].includes(String(action)) &&
    await sha256(canonical(payload)) !== body.payload_hash
  ) {
    throw new HttpError(
      400,
      "payload_hash_mismatch",
      "payload_hash does not match the canonical payload.",
    );
  }
  const auth = await authenticate(request);

  if (!UUID.test(String(body.record_id))) {
    throw new HttpError(400, "validation", "record_id is invalid.");
  }

  if (action === "begin") validateFields(payload, false);
  else if (action === "edit") {
    validateFields(payload, true);
    if (
      !Number.isInteger(body.base_version) || (body.base_version as number) < 1
    ) throw new HttpError(400, "validation", "base_version is required.");
  } else {
    exactKeys(payload, new Set());
    if (
      action === "delete" &&
      (!Number.isInteger(body.base_version) ||
        (body.base_version as number) < 1)
    ) throw new HttpError(400, "validation", "base_version is required.");
  }

  if (action === "finalize") {
    const inspected = await transaction("inspect", auth, body, payload);
    if (object(inspected.record) && inspected.record.status === "ready") {
      return response({ record: inspected.record });
    }
    const record = inspected.record as Record<string, Json>;
    const path = `${auth.userId}/${body.record_id}/stamp.png`;
    if (record.stamp_image_path !== path) {
      throw new HttpError(500, "internal", "The reserved image path is invalid.");
    }
    const bytes = await storage(path, "GET");
    try {
      await validatePng(bytes as Uint8Array, {
        sha256: record.stamp_sha256,
        bytes: record.bytes,
        width: record.width,
        height: record.height,
      });
    } catch (error) {
      if (error instanceof HttpError && error.code === "invalid_image") {
        await storage(path, "DELETE");
      }
      throw error;
    }
    const finalized = await transaction(action, auth, body, payload);
    return response({ record: finalized.record });
  }

  const result = await transaction(action as string, auth, body, payload);
  if (action === "delete" || action === "abort") {
    const record = result.record;
    if (object(record)) {
      await storage(record.stamp_image_path as string, "DELETE");
      const purged = await rpc("record_lifecycle_admin", {
        p_action: "purge_record",
        p_user_id: auth.userId,
        p_record_id: body.record_id,
      });
      rpcError(purged);
    }
    return response({ record: null });
  }
  return response({ record: result.record });
}

if (import.meta.main) Deno.serve((request) => handler(request).catch(fail));

export { canonical, sha256, validatePng };
