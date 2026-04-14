export interface LegacyApiRequest {
  api_version: "v1";
  request_id: string;
  method: string;
  payload: Record<string, unknown>;
}

export interface LegacyApiSuccessResponse {
  status: "ok";
  request_id: string;
  payload: Record<string, unknown>;
}

export interface LegacyApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown> & {
    message: string;
  };
}

export interface LegacyApiErrorResponse {
  status: "error";
  request_id: string;
  error: LegacyApiErrorBody;
}

export type LegacyApiResponse = LegacyApiSuccessResponse | LegacyApiErrorResponse;

export interface LegacyApiBridge {
  invoke(request: LegacyApiRequest): Promise<LegacyApiResponse>;
}

export interface LegacyPywebview {
  api: LegacyApiBridge;
}

declare global {
  interface Window {
    pywebview?: LegacyPywebview;
  }
}
