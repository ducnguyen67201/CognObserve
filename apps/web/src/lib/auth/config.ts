import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@cognobserve/db";
import { providers } from "./providers";
import { env } from "../env";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  providers,

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
    newUser: "/", // Redirect to home, which will redirect to default workspace
  },

  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }

      // Add workspace and project access to token (for API authorization)
      if (token.id) {
        // Fetch workspace memberships
        const workspaceMemberships = await prisma.workspaceMember.findMany({
          where: { userId: token.id as string },
          include: {
            workspace: {
              select: { id: true, name: true, slug: true, isPersonal: true },
            },
          },
        });

        token.workspaces = workspaceMemberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          role: m.role,
          isPersonal: m.workspace.isPersonal,
        }));

        // Fetch project memberships
        const projectMemberships = await prisma.projectMember.findMany({
          where: { userId: token.id as string },
          select: { projectId: true, role: true },
        });

        token.projects = projectMemberships.map((m) => ({
          id: m.projectId,
          role: m.role,
        }));
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.workspaces = token.workspaces as Array<{
          id: string;
          name: string;
          slug: string;
          role: string;
          isPersonal: boolean;
        }>;
        session.user.projects = token.projects as Array<{
          id: string;
          role: string;
        }>;
      }
      return session;
    },
  },

  events: {
    async signIn({ user, isNewUser }) {
      if (isNewUser && user.id) {
        const MAX_RETRIES = 3;
        const baseSlug = `user-${user.id.slice(-8)}`;
        let workspace = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

          try {
            // Create personal workspace with default project for new users
            workspace = await prisma.workspace.create({
              data: {
                name: user.name ? `${user.name}'s Workspace` : "Personal",
                slug,
                isPersonal: true,
                members: {
                  create: {
                    userId: user.id,
                    role: "OWNER",
                  },
                },
                projects: {
                  create: {
                    name: "My First Project",
                    members: {
                      create: {
                        userId: user.id,
                        role: "OWNER",
                      },
                    },
                  },
                },
              },
            });
            break; // Success, exit loop
          } catch (error) {
            // P2002 = unique constraint violation (slug taken)
            const isPrismaError = error instanceof Error && "code" in error;
            if (isPrismaError && (error as { code: string }).code === "P2002" && attempt < MAX_RETRIES - 1) {
              continue; // Retry with random suffix
            }
            throw error; // Rethrow other errors or final attempt failure
          }
        }

      }
    },
  },

  debug: env.NODE_ENV === "development",
};
