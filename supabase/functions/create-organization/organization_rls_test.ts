import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const E2E_USER_EMAIL = Deno.env.get("E2E_USER_EMAIL");
const E2E_USER_PASSWORD = Deno.env.get("E2E_USER_PASSWORD");

const hasRequiredEnv = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY && E2E_USER_EMAIL && E2E_USER_PASSWORD,
);

const uniqueName = (prefix: string) => `${prefix} ${crypto.randomUUID()}`;

const getClients = async () => {
  assertExists(SUPABASE_URL);
  assertExists(SUPABASE_ANON_KEY);
  assertExists(SUPABASE_SERVICE_ROLE_KEY);
  assertExists(E2E_USER_EMAIL);
  assertExists(E2E_USER_PASSWORD);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await userClient.auth.signInWithPassword({
    email: E2E_USER_EMAIL,
    password: E2E_USER_PASSWORD,
  });

  assert(!error, error?.message);
  assertExists(data.user);

  return { userClient, adminClient, user: data.user };
};

const cleanupOrganization = async (adminClient: any, organizationId?: string | null) => {
  if (!organizationId) return;
  await adminClient.from("organization_members").delete().eq("organization_id", organizationId);
  await adminClient.from("organizations").delete().eq("id", organizationId);
};

Deno.test({
  name: "RLS organizations: permite INSERT quando owner_id é o usuário autenticado",
  ignore: !hasRequiredEnv,
  fn: async () => {
    const { userClient, adminClient, user } = await getClients();
    let organizationId: string | undefined;

    try {
      const { data, error } = await userClient
        .from("organizations")
        .insert({ name: uniqueName("RLS Insert Owner"), owner_id: user.id })
        .select("id, owner_id")
        .single();

      assert(!error, error?.message);
      assertExists(data);
      organizationId = data.id;
      assertEquals(data.owner_id, user.id);
    } finally {
      await cleanupOrganization(adminClient, organizationId);
      await userClient.auth.signOut();
    }
  },
});

Deno.test({
  name: "RLS organizations: fluxo transacional cria organização e organization_members owner juntos",
  ignore: !hasRequiredEnv,
  fn: async () => {
    const { userClient, adminClient, user } = await getClients();
    let organizationId: string | undefined;

    try {
      const { data, error } = await userClient.functions.invoke<{ organizationId: string }>("create-organization", {
        body: { name: uniqueName("RLS Transaction Owner"), cnpj: null },
      });

      assert(!error, error?.message);
      assertExists(data?.organizationId);
      organizationId = data.organizationId;

      const { data: org, error: orgError } = await adminClient
        .from("organizations")
        .select("id, owner_id")
        .eq("id", organizationId)
        .single();
      assert(!orgError, orgError?.message);
      assertEquals(org.owner_id, user.id);

      const { data: member, error: memberError } = await adminClient
        .from("organization_members")
        .select("organization_id, user_id, role, status")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .eq("role", "owner")
        .single();

      assert(!memberError, memberError?.message);
      assertEquals(member.organization_id, organizationId);
      assertEquals(member.user_id, user.id);
      assertEquals(member.status, "ativo");
    } finally {
      await cleanupOrganization(adminClient, organizationId);
      await userClient.auth.signOut();
    }
  },
});