export interface CldLoginResponse {
  access_token: string;
  exp?: number;
  refresh_token?: string;
  info?: any;
  success?: boolean;
  label?: string | null;
}