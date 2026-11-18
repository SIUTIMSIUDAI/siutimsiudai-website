import { getMyFamily } from "@/services/familyService";

// The family roster carries each member's photo path under the same rule as their name: the profiles
// query only returns rows row-level security lets the caller read, so a hidden profile yields neither
// a name nor a photo.
//
// The fake returns only the columns a query selected, so a query that forgets a column gets nothing
// for it, as the real API would.

const mockUid = "11111111-1111-4111-8111-111111111111";
const DEPENDENT = "22222222-2222-4222-8222-222222222222";
const GROUP = "33333333-3333-4333-8333-333333333333";

const ALL_PROFILES = [
  { id: mockUid, display_name: "Mei", avatar_path: `${mockUid}/1.jpg` },
  { id: DEPENDENT, display_name: "Ah Ma", avatar_path: `${DEPENDENT}/2.jpg` },
];
const mockTables: Record<string, Array<Record<string, unknown>>> = {
  family_members: [
    { group_id: GROUP, user_id: mockUid, role: "manager" },
    { group_id: GROUP, user_id: DEPENDENT, role: "dependent" },
  ],
  family_groups: [{ id: GROUP, name: "Chan family", name_zh: "陳家", max_members: 6 }],
  profiles: [],
  family_invitations: [],
};

function mockQuery(table: string) {
  let columns: string[] = [];
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const run = () =>
    (mockTables[table] ?? [])
      .filter((row) => filters.every((keep) => keep(row)))
      .map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
  const builder = {
    select(list: string) {
      columns = list.split(",").map((c) => c.trim());
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    limit: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then<T>(resolve: (result: { data: unknown; error: null }) => T) {
      return Promise.resolve({ data: run(), error: null }).then(resolve);
    },
  };
  return builder;
}

jest.mock("@/services/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: mockUid } } } }) },
    from: (table: string) => mockQuery(table),
  },
}));

beforeEach(() => {
  mockTables.profiles = [...ALL_PROFILES];
});

it("gives each member the photo path from their profile", async () => {
  const snapshot = await getMyFamily();
  expect(snapshot.members.map((m) => [m.userId, m.displayName, m.avatarPath])).toEqual([
    [mockUid, "Mei", `${mockUid}/1.jpg`],
    [DEPENDENT, "Ah Ma", `${DEPENDENT}/2.jpg`],
  ]);
});

it("has no photo for a member whose profile the caller cannot read", async () => {
  mockTables.profiles = ALL_PROFILES.filter((p) => p.id === mockUid);
  const snapshot = await getMyFamily();
  expect(snapshot.members.find((m) => m.userId === DEPENDENT)).toMatchObject({
    displayName: null,
    avatarPath: null,
  });
});
