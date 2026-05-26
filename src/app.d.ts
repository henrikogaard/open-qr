declare global {
  namespace App {
    interface Locals {
      user: { id: number; email: string; isAdmin: boolean } | null;
    }
    interface Error {
      code?: string;
      message: string;
    }
  }
}

export {};
