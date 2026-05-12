import { Client } from "@elastic/elasticsearch";

const ELASTIC_URL = process.env.ELASTICSEARCH_URL;
const INDEX = "kanban_tickets";

let client: Client | null = null;

function getClient(): Client | null {
  if (!ELASTIC_URL) return null;
  if (!client) client = new Client({ node: ELASTIC_URL });
  return client;
}

export const elasticEnabled = !!ELASTIC_URL;

export interface TicketDoc {
  id: string;
  organizationId: string;
  number: number;
  title: string;
  description: string | null;
  topic: string | null;
  inventoryNumber: string | null;
  fromEmail: string | null;
  fromName: string | null;
  status: string;
  priority: string;
  queueName: string | null;
  teamName: string | null;
  assigneeName: string | null;
  createdAt: string;
}

export async function indexTicket(doc: TicketDoc): Promise<void> {
  const es = getClient();
  if (!es) return;
  try {
    await es.index({ index: INDEX, id: doc.id, document: doc });
  } catch {
    // Non-fatal: fall back to DB search
  }
}

export async function deleteTicketFromIndex(id: string): Promise<void> {
  const es = getClient();
  if (!es) return;
  try {
    await es.delete({ index: INDEX, id });
  } catch {
    // ignore
  }
}

export async function searchTickets(
  query: string,
  organizationId: string,
  from = 0,
  size = 25
): Promise<{ ids: string[]; total: number } | null> {
  const es = getClient();
  if (!es) return null;

  try {
    const result = await es.search({
      index: INDEX,
      from,
      size,
      query: {
        bool: {
          must: [
            { term: { organizationId } },
            {
              multi_match: {
                query,
                fields: ["title^3", "description", "topic^2", "inventoryNumber^2", "fromEmail", "fromName"],
                fuzziness: "AUTO",
              },
            },
          ],
        },
      },
    });

    const hits = result.hits.hits;
    const total = typeof result.hits.total === "number"
      ? result.hits.total
      : (result.hits.total as { value: number }).value;

    return { ids: hits.map((h) => h._id as string), total };
  } catch {
    return null;
  }
}

export async function ensureIndex(): Promise<void> {
  const es = getClient();
  if (!es) return;
  try {
    const exists = await es.indices.exists({ index: INDEX });
    if (!exists) {
      await es.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            organizationId:  { type: "keyword" },
            number:          { type: "integer" },
            title:           { type: "text", analyzer: "standard" },
            description:     { type: "text", analyzer: "standard" },
            topic:           { type: "text", fields: { keyword: { type: "keyword" } } },
            inventoryNumber: { type: "keyword" },
            fromEmail:       { type: "keyword" },
            fromName:        { type: "text" },
            status:          { type: "keyword" },
            priority:        { type: "keyword" },
            queueName:       { type: "keyword" },
            teamName:        { type: "keyword" },
            assigneeName:    { type: "text" },
            createdAt:       { type: "date" },
          },
        },
      });
    }
  } catch {
    // ignore
  }
}
