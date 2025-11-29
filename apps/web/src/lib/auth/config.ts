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
    newUser: "/projects",
  },

  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }

      // Add project access to token (for API authorization)
      if (token.id) {
        const memberships = await prisma.projectMember.findMany({
          where: { userId: token.id as string },
          select: { projectId: true, role: true },
        });
        token.projects = memberships.map((m) => ({
          id: m.projectId,
          role: m.role,
        }));
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
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
        // Create default project for new users
        const project = await prisma.project.create({
          data: {
            name: "My First Project",
            members: {
              create: {
                userId: user.id,
                role: "OWNER",
              },
            },
          },
        });
        console.log(
          `Created default project ${project.id} for user ${user.id}`
        );
      }
    },
  },

  debug: env.NODE_ENV === "development",
};
