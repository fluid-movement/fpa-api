import { OpenAPIHono } from '@hono/zod-openapi';
export declare const OPENAPI_DOC: {
    openapi: string;
    info: {
        title: string;
        version: string;
        description: string;
    };
    tags: {
        name: string;
        description: string;
    }[];
};
export declare function createApp(): OpenAPIHono;
export type AppType = ReturnType<typeof createApp>;
