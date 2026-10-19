declare global {
  interface Navigator {
    readonly globalPrivacyControl?: boolean;
  }
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
