FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/keeper/package.json packages/keeper/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter keeper build

WORKDIR /app/packages/keeper

CMD ["node", "dist/runner.js"]
