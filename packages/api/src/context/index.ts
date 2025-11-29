import type { Session } from "next-auth";

/**
 * Context passed to all tRPC procedures.
 * Contains session info and any other request-specific data.
 */
export interface Context {
  session: Session | null;
}

/**
 * Project access from session
 */
export interface ProjectAccess {
  id: string;
  role: string;
}

/**
 * Extended session with project access
 */
export interface SessionWithProjects extends Session {
  user: Session["user"] & {
    id: string;
    projects: ProjectAccess[];
  };
}
