import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const app = new Hono();

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') || '';
const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error('Missing one or more required Supabase environment variables.');
}

const STORAGE_BUCKET = 'make-9a7b4805-images';
const GLOBAL_SETTINGS_KEY = 'global-settings';

const defaultGlobalSettings = {
  counties: [],
  themes: [
    { id: 'housing', nameNo: 'Bolig', color: '#ef4444' },
    { id: 'school', nameNo: 'Skole', color: '#f59e0b' },
    { id: 'transport', nameNo: 'Transport', color: '#10b981' },
    { id: 'healthcare', nameNo: 'Helse', color: '#3b82f6' },
    { id: 'environment', nameNo: 'Miljø', color: '#22c55e' },
    { id: 'economy', nameNo: 'Økonomi', color: '#8b5cf6' },
    { id: 'culture', nameNo: 'Kultur', color: '#ec4899' },
    { id: 'labor', nameNo: 'Arbeidsliv', color: '#f97316' },
    { id: 'other', nameNo: 'Annet', color: '#6b7280' },
  ],
  strategies: [
    { id: 'progressive', nameNo: 'Progressiv', color: '#10b981' },
    { id: 'moderate', nameNo: 'Moderat', color: '#f59e0b' },
    { id: 'heavy-left', nameNo: 'Tung venstre', color: '#ef4444' },
  ],
  outlets: [
    {
      id: 'aftenposten',
      name: 'Aftenposten',
      supportedThemes: ['housing', 'school', 'transport', 'healthcare', 'environment', 'economy', 'culture', 'labor'],
      supportedStrategies: ['progressive', 'moderate'],
      coverageKrets: [],
      coverageMunicipalities: [],
      coverageCounties: ['oslo'],
      description: 'Norges største avis',
    },
    {
      id: 'klassekampen',
      name: 'Klassekampen',
      supportedThemes: ['labor', 'economy', 'housing', 'environment'],
      supportedStrategies: ['progressive', 'heavy-left'],
      coverageKrets: [],
      coverageMunicipalities: [],
      coverageCounties: ['oslo'],
      description: 'Venstreorientert dagsavis',
    },
    {
      id: 'dagsavisen',
      name: 'Dagsavisen',
      supportedThemes: ['housing', 'school', 'transport', 'healthcare', 'labor'],
      supportedStrategies: ['progressive', 'moderate'],
      coverageKrets: [],
      coverageMunicipalities: [],
      coverageCounties: ['oslo'],
      description: 'Sosialdemokratisk orientert',
    },
  ],
  version: 1,
  lastUpdated: new Date().toISOString(),
};

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

(async () => {
  try {
    const { data: buckets } = await adminClient.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === STORAGE_BUCKET);

    if (!exists) {
      await adminClient.storage.createBucket(STORAGE_BUCKET, { public: false });
      console.log("Created bucket:", STORAGE_BUCKET);
    }
  } catch (err) {
    console.log("Storage init failed:", err);
  }
})();

const getAuthenticatedUser = async (authHeader?: string) => {
  try {
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.split(" ")[1];
    if (!token) return null;

    const { data, error } = await anonClient.auth.getUser(token);
    if (error || !data?.user) return null;

    return data.user;
  } catch {
    return null;
  }
};

const getRequestJson = async (c: any) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};

const getAdminAccess = async (authHeader?: string, password?: string) => {
  const user = await getAuthenticatedUser(authHeader);
  const email = user?.email?.toLowerCase();

  if (email && ADMIN_EMAILS.includes(email)) {
    return { ok: true, method: 'email', user };
  }

  if (ADMIN_PASSWORD && password && password === ADMIN_PASSWORD) {
    return { ok: true, method: 'password', user };
  }

  return { ok: false, method: null, user };
};

const normalizeGlobalSettings = (settings: any) => ({
  ...defaultGlobalSettings,
  ...(settings || {}),
  counties: Array.isArray(settings?.counties) ? settings.counties : defaultGlobalSettings.counties,
  themes: Array.isArray(settings?.themes) && settings.themes.length > 0 ? settings.themes : defaultGlobalSettings.themes,
  strategies: Array.isArray(settings?.strategies) && settings.strategies.length > 0 ? settings.strategies : defaultGlobalSettings.strategies,
  outlets: Array.isArray(settings?.outlets) && settings.outlets.length > 0 ? settings.outlets : defaultGlobalSettings.outlets,
  version: Number.isFinite(settings?.version) ? settings.version : defaultGlobalSettings.version,
  lastUpdated: typeof settings?.lastUpdated === 'string' ? settings.lastUpdated : defaultGlobalSettings.lastUpdated,
});

app.get("/make-server-9a7b4805/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/make-server-9a7b4805/global-settings", async (c) => {
  try {
    const storedSettings = await kv.get(GLOBAL_SETTINGS_KEY);
    return c.json({ settings: normalizeGlobalSettings(storedSettings) });
  } catch {
    return c.json({ error: "Could not fetch global settings" }, 500);
  }
});

app.post("/make-server-9a7b4805/admin/verify", async (c) => {
  const body = await getRequestJson(c);
  const admin = await getAdminAccess(c.req.header("Authorization"), body.password);

  if (!admin.ok) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ ok: true, method: admin.method });
});

app.put("/make-server-9a7b4805/admin/global-settings", async (c) => {
  const body = await getRequestJson(c);
  const admin = await getAdminAccess(c.req.header("Authorization"), body.password);

  if (!admin.ok) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!body.settings || typeof body.settings !== 'object') {
    return c.json({ error: "Missing settings" }, 400);
  }

  try {
    const currentSettings = normalizeGlobalSettings(await kv.get(GLOBAL_SETTINGS_KEY));
    const nextVersion = Number.isFinite(body.settings.version)
      ? body.settings.version
      : currentSettings.version + 1;
    const nextSettings = normalizeGlobalSettings({
      ...currentSettings,
      ...body.settings,
      version: nextVersion,
      lastUpdated: new Date().toISOString(),
    });

    await kv.set(GLOBAL_SETTINGS_KEY, nextSettings);
    return c.json({ settings: nextSettings });
  } catch {
    return c.json({ error: "Could not update global settings" }, 500);
  }
});

app.post("/make-server-9a7b4805/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true,
    });

    if (error || !data.user) {
      return c.json({ error: error?.message || 'Failed to create user' }, 400);
    }

    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata.name,
      },
    });
  } catch {
    return c.json({ error: "Signup failed" }, 500);
  }
});

app.post("/make-server-9a7b4805/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Missing email or password" }, 400);
    }

    const { data, error } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session) {
      return c.json({ error: error?.message || 'Invalid login response' }, 401);
    }

    return c.json({
      accessToken: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata.name,
      },
    });
  } catch {
    return c.json({ error: "Login failed" }, 500);
  }
});

app.post("/make-server-9a7b4805/upload-image", async (c) => {
  const user = await getAuthenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const fileExt = file.name.split(".").pop() || 'bin';
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;
    const buffer = await file.arrayBuffer();

    const { error } = await adminClient.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type,
      });

    if (error) {
      return c.json({ error: "Upload failed" }, 500);
    }

    const { data } = await adminClient.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    return c.json({ url: data?.signedUrl || "" });
  } catch {
    return c.json({ error: "Upload failed" }, 500);
  }
});

app.get("/make-server-9a7b4805/articles", async (c) => {
  const user = await getAuthenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const articles = await kv.getByPrefix(`articles:${user.id}:`);
    return c.json({ articles });
  } catch {
    return c.json({ error: 'Could not fetch articles' }, 500);
  }
});

app.post("/make-server-9a7b4805/articles", async (c) => {
  const user = await getAuthenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const article = await c.req.json();
    const id = Date.now().toString();

    const full = {
      ...article,
      id,
      userId: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      collaborators: [user.id],
      comments: [],
    };

    await kv.set(`articles:${user.id}:${id}`, full);
    return c.json({ article: full });
  } catch {
    return c.json({ error: 'Could not create article' }, 500);
  }
});

app.put("/make-server-9a7b4805/articles/:id", async (c) => {
  const user = await getAuthenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    const existing = await kv.get(`articles:${user.id}:${id}`);
    if (!existing) return c.json({ error: "Not found" }, 404);

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`articles:${user.id}:${id}`, updated);
    return c.json({ article: updated });
  } catch {
    return c.json({ error: 'Could not update article' }, 500);
  }
});

app.delete("/make-server-9a7b4805/articles/:id", async (c) => {
  const user = await getAuthenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const id = c.req.param("id");
    await kv.del(`articles:${user.id}:${id}`);
    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Could not delete article' }, 500);
  }
});

Deno.serve(app.fetch);
