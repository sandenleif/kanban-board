import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

// Static org data changes rarely — cache for 5 minutes, invalidate via tags

export const getCachedQueues = (organizationId: string) =>
  unstable_cache(
    () => prisma.ticketQueue.findMany({ where: { organizationId }, orderBy: { position: "asc" } }),
    [`queues-${organizationId}`],
    { revalidate: 300, tags: [`org-${organizationId}-queues`] }
  )();

export const getCachedTeams = (organizationId: string) =>
  unstable_cache(
    () => prisma.ticketTeam.findMany({ where: { organizationId }, orderBy: { position: "asc" } }),
    [`teams-${organizationId}`],
    { revalidate: 300, tags: [`org-${organizationId}-teams`] }
  )();

export const getCachedCategories = (organizationId: string) =>
  unstable_cache(
    () => prisma.ticketCategory.findMany({ where: { organizationId }, orderBy: { position: "asc" } }),
    [`categories-${organizationId}`],
    { revalidate: 300, tags: [`org-${organizationId}-categories`] }
  )();

export const getCachedOrgUsers = (organizationId: string) =>
  unstable_cache(
    () => prisma.user.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    [`org-users-${organizationId}`],
    { revalidate: 300, tags: [`org-${organizationId}-users`] }
  )();

// Overview stats — cache 60 seconds (near real-time is fine for dashboards)
export const getCachedTicketStats = (organizationId: string) =>
  unstable_cache(
    async () => {
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const escalationThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [stats, created7, closed7, teamStats] = await Promise.all([
        prisma.ticket.groupBy({ by: ["status"], where: { organizationId }, _count: { id: true } }),
        prisma.ticket.findMany({ where: { organizationId, createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } }),
        prisma.ticket.findMany({ where: { organizationId, closedAt: { gte: sevenDaysAgo } }, select: { closedAt: true } }),
        prisma.ticket.groupBy({
          by: ["requesterType"],
          where: { organizationId, status: { in: ["OPEN", "IN_PROGRESS"] } },
          _count: { id: true },
        }),
      ]);

      return { stats, created7, closed7, teamStats, sixMonthsAgo, escalationThreshold };
    },
    [`ticket-stats-${organizationId}`],
    { revalidate: 60, tags: [`org-${organizationId}-tickets`] }
  )();
