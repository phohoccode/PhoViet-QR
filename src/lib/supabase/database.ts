/** P1-C02 persistence types, not API DTO copies. Regenerate when schema grows. */
type Timestamps = { created_at: string; updated_at: string };
type StoreRow = Timestamps & {
  id: string; name: string; timezone: string; accepting_orders: boolean; version: number;
};
type MembershipRow = { store_id: string; auth_user_id: string; role: "owner"; created_at: string };
type TableRow = Timestamps & { id: string; store_id: string; label: string; active: boolean };
type QrRow = Timestamps & {
  id: string; store_id: string; type: "table" | "takeaway";
  table_id: string | null; public_code: string; active: boolean;
};
type TableDefinition<Row, Insert, Update> = {
  Row: Row; Insert: Insert; Update: Update; Relationships: [];
};
export type Database = {
  public: {
    Tables: {
      stores: TableDefinition<StoreRow, { name: string }, { name?: string; accepting_orders?: boolean }>;
      owner_members: TableDefinition<MembershipRow, never, never>;
      dining_tables: TableDefinition<TableRow,
        { store_id: string; label: string; active?: boolean }, { label?: string; active?: boolean }>;
      qr_codes: TableDefinition<QrRow,
        { store_id: string; type: "table" | "takeaway"; table_id: string | null; active?: boolean },
        { active?: boolean }>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
