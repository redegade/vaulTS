import request from 'request-promise-native';
import {resolveURL} from "./util";
import {VaultHealthClient} from "./sys/VaultHealthClient";
import {TransitVaultClient} from "./engines/transit";

export type VaultHTTPMethods = "GET" | "POST" | "DELETE" | "LIST";

export interface IVaultConfig {
    vaultAddress?: string;
    vaultToken?: string;
    vaultCaCertificate?: string;
    vaultNamespace?: string;
    apiVersion?: string;
}

export class VaultError extends Error {
}

export interface IVaultErrorResponse {
    statusCode: number;
    body?: {
        errors: string[];
    };
}

export class VaultRequestError extends VaultError {
    constructor(message: string, private response: IVaultErrorResponse) {
        super(message);
    }
}

export class Vault {
    readonly config: IVaultConfig;

    constructor(userConfig?: IVaultConfig) {
        this.config = {
            vaultAddress: process.env.VAULT_ADDR || "http://127.0.0.1:8200",
            apiVersion: "v1",
            vaultToken: process.env.VAULT_TOKEN,
            ...userConfig
        };
    }

    get token(): string | undefined {
        return this.config.vaultToken;
    }

    private async request(method: VaultHTTPMethods, path: string | string[], body: any, acceptedReturnCodes: number[] = [200, 204]): Promise<any> {
        if (typeof path === "string") {
            path = [path];
        }
        const uri: URL = resolveURL(this.config.vaultAddress!, this.config.apiVersion!, ...path);

        const requestOptions: request.Options = {
            method: method,
            uri,
            headers: {
                "X-Vault-Token": this.config.vaultToken,
                "X-Vault-Namespace": this.config.vaultNamespace
            },
            body,
            json: true,
            // vault health endpoint responds with >400 status code
            simple: false,
            resolveWithFullResponse: true
        };

        const res = await request(requestOptions);

        if (!acceptedReturnCodes.some(c => c == res.statusCode)) {
            let errorResponse: IVaultErrorResponse = {
                statusCode: res.statusCode,
            };

            if (res.body && res.body.errors && res.body.errors.length > 0) {
                errorResponse = {
                    ...errorResponse,
                    body: res.body,
                }
            }
            throw new VaultRequestError(`Request to ${requestOptions.uri.toString()} failed (Status ${errorResponse.statusCode})`, errorResponse);
        }

        return res.body;
    }

    public async read(path: string | string[], acceptedReturnCodes?: number[]): Promise<any> {
        return this.request('GET', path, {}, acceptedReturnCodes);
    }

    public async write(path: string | string[], body: any, acceptedReturnCodes?: number[]): Promise<any> {
        return this.request('POST', path, body, acceptedReturnCodes);
    }

    public async delete(path: string | string[], body: any, acceptedReturnCodes?: number[]): Promise<any> {
        return this.request('DELETE', path, body, acceptedReturnCodes);
    }

    public async list(path: string | string[], acceptedReturnCodes?: number[]): Promise<any> {
        return this.request('LIST', path, {}, acceptedReturnCodes);
    }

    public Health(): VaultHealthClient {
        return new VaultHealthClient(this, '/sys');
    }

    public Transit(mountPoint?: string) {
        return new TransitVaultClient(this, mountPoint);
    }
}
