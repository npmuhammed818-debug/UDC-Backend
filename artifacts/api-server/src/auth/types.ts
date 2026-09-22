export type AuthenticatedUser = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  role: string;
  status: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      authToken?: string;
    }
  }
}

export {};