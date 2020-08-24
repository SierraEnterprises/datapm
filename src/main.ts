import "reflect-metadata";

import express from "express";
import helmet from "helmet";
import querystring from "querystring";
import express_enforces_ssl from "express-enforces-ssl";
import proxy from "express-http-proxy";
import { ApolloServer } from "apollo-server-express";

import { Context } from "./context";
import { getMeRequest, getMeSub } from "./util/me";
import { registerBucketHosting } from "./util/storage";
import { makeSchema } from "./schema";
import path from "path";
import {
  getSecretVariable,
  setAppEngineServiceAccountJson,
} from "./util/secrets";
import { createDataLoaders } from "./dataLoaders";
import { GraphQLError } from "graphql";
import { superCreateConnection } from "./util/databaseCreation";

const REFERER_REGEX = /\/graphql\/?$/;

async function main() {
  // get secrets from environment variable or from secret manager
  // NOTE: getSecretVariable does not throw/fail. If the secret is unable
  // to be retrieved, a warning message is logged. Let the system fail
  // normally as if the variable went unset. This is because certain secrets
  // (such as SENDGRID_API_KEY) is not required.
  await getSecretVariable("TYPEORM_PASSWORD");
  await getSecretVariable("SENDGRID_API_KEY");
  await setAppEngineServiceAccountJson();

  const connection = await superCreateConnection();

  // if the GRAPHQL_CONTEXT_USER_SUB environment variable is set, get me context
  // from GRAPHQL_CONTEXT_USER_SUB, else, get it from the express request object
  // GRAPHQL_CONTEXT_USER_SUB should not be set in packageion

  console.log(`process.env.GRAPHQL_CONTEXT_USER_SUB set to ${process.env.GRAPHQL_CONTEXT_USER_SUB}`)

  const context = process.env.GRAPHQL_CONTEXT_USER_SUB
    ? async ({ req }: { req: express.Request }): Promise<Context> => ({
        request: req,
        me: await getMeSub(
          process.env.GRAPHQL_CONTEXT_USER_SUB!,
          connection.manager
        ),
        connection: connection,
        dataLoaders: createDataLoaders(),
      })
    : async ({ req }: { req: express.Request }): Promise<Context> => ({
        request: req,
        me: await getMeRequest(req, connection.manager),
        connection: connection,
        dataLoaders: createDataLoaders(),
      });

  const schema = await makeSchema();

  const server = new ApolloServer({
    schema,
    context,
    introspection: true,
    playground: true,
    tracing: true,
    engine: {
      sendVariableValues: { none: true },
      rewriteError: (err: GraphQLError) => {
        // attempt to remove PII from certain error messages
        err.message = err.message.replace(
          /^(Variable "\$\S+" got invalid value )(.*?)( at ".*")?(;.*\.)$/,
          (_match, p1, _p2, p3, p4) => `${p1}"HIDDEN"${p3 || ""}${p4}`
        );

        return err;
      },
      generateClientInfo: ({ request }) => {
        let clientName: string | undefined = undefined;
        let clientVersion: string | undefined = undefined;

        const headers = request.http?.headers;
        if (headers) {
          clientName = headers.get("apollographql-client-name") ?? undefined;
          clientVersion =
            headers.get("apollographql-client-version") ?? undefined;

          const referer = headers.get("referer");
          if (
            !clientName &&
            !clientVersion &&
            REFERER_REGEX.test(referer ?? "")
          ) {
            clientName = "playground";
          }
        }

        return {
          clientName,
          clientVersion,
        };
      },
    },
  });

  const app = express();
  // security middleware for headers. See https://helmetjs.github.io/
  app.use(helmet());
  app.disable("x-powered-by");

  console.log(`Running in ${app.get("env")} mode`);

  // these two lines force the user to connect using HTTPS
  // App Engine terminates https and connects to express
  // using http
  if (app.get("env") !== "development") {
    app.enable("trust proxy");
    app.use(express_enforces_ssl());
  }

  const hstsMiddleware = helmet.hsts({
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  });

  // App Engine defines PORT as an environment variable. Otherwise, use 4000
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;

  app.use((req, res, next) => {
    if (req.secure) {
      hstsMiddleware(req, res, next);
    } else {
      next();
    }
  });

  // format is /_sentry/original-url/path?query
  app.use(
    "/_sentry",
    // extract original-url
    proxy((req) => req.path.split("/")[1], {
      https: true,
      proxyReqPathResolver: (req) => {
        // get everything after original-url
        return `/${req.path
          .split("/")
          .slice(2)
          .join("/")}?${querystring.stringify(
          req.query as NodeJS.Dict<string>
        )}`;
      },
    })
  );

  // these two routes serve angular static content
  app.use(
    "/static",
    express.static(path.join(__dirname, "..", "static"), {
      setHeaders: (res, path) => {
        // set cache to 1 year for anything that includes a hash
        const maxAge = path.match(/\.[a-fA-F0-9]{20}\.[^\/]+$/) ? 31536000 : 0;
        res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
      },
    })
  );
  app.use(
    "/assets",
    express.static(path.join(__dirname, "..", "static", "assets"))
  );

  // when using FileSystemStorage for media files, sets up file hosting
  registerBucketHosting(app, "/bucket", port);

  // set express for the Apollo GraphQL server
  server.applyMiddleware({ app, bodyParserConfig: { limit: "1mb" } });

  // any route not yet defined goes to index.html
  app.use("*", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "static", "index.html"));
  });

  app.listen({ port }, () => {
    console.log(`🚀 Server ready at http://localhost:${port}`);
  });
}

main().catch((error) => console.log(error));
