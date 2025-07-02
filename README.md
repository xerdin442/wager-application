# Wager Application

This API is a robust backend service for a stablecoin-powered wager application that enables users create and join wagers, as well as dispute and resolve wagers. It is designed in a microservice architecture to ensure scalability, reliability, and maintainability.

## Features

- **User Authentication**: Secure user authentication system - with an option to enable 2FA for added security - and role-based access control for users and admins.
- **Social Authentication**: Google authentication for quicker user sign-in or onboarding.
- **Wager Management**: Creation and joining of head-to-head wagers on any topic of choice across diverse categories.
- **Dispute Resolution**: Evidence-based resolution mechanism to address disputes between wager players, with a focus on fairness and transparency.
- **Stablecoin Integration**: USDC deposits and withdrawals (on Base and Solana) to enhance borderless payments.
- **Domain Names**: Supports the use of Basenames and SNS domains for withdrawals.
- **Notifications**: Websockets for real-time transaction updates and chat rooms for dispute resolution.
- **Queue Management**: Optimized asynchronous processing by using queues to abstract transaction processing, dispute resolution and email notifications from the main application workflow.
- **Metrics and Analytics**: Tracks important metrics like transaction volumes and dispute resolution rates using Prometheus-compatible endpoints.

## Coming up...

- **Multi-Player Contests**: Multi-player prize contests for games such as Call of Duty Mobile and Fantasy Premier League (FPL).
- **Savings**: Feature to enable auto-save on winnings. The savings will be staked onchain, and yields will be accumulated to grow the user's balance over time.
- **Rewards**: Onchain reward system to allocate points on public leaderboard for consistent players based on individual wins and winning streak.

## Deployment

:globe_with_meridians: **A live deployment link and Postman collection is available upon request**

## Prerequisites

- Node.js
- Docker
- Docker Desktop

## Tech Stack

- **Framework**: NestJS
- **Database**: Postgres
- **File Storage**: AWS S3
- **Queues**: BullMQ
- **Message Broker**: NATS
- **Mail**: Resend
- **Tests**: Jest & Supertest
- **CI/CD**: Github Actions
- **Metrics**: Prometheus & Grafana
- **Blockchain RPC Providers**: Helius (Solana) & Alchemy (Base)

## Getting Started

Clone this repository and follow the instructions to set up the project locally:

### 1. Installation
- Run `npm install` to install all the project dependencies.

### 2. Environment Variables
- [Use the sample here](./.env.example) to create two files - `.env` and `.env.local` - for storing and managing the required global environment variables. Look for `.env.example` file in each service in `apps` folder to see if there are service-level environment variables. If any, create a `.env` file at the root of the service directory and the variables.
- `.env.test` file is a combination of all service-level environment variables across the individual services and those in the global `.env` file. If there are overlapping variables, use just one.
- `localhost` should be the hostname for all external service urls (db, redis and nats) in the `.env.test` file. This will connect the test environment to the same docker instances as `docker.host.internal` in the `compose.test.yml` file.

### 3. Database Migrations
The database schema is located [here](prisma/schema.prisma). If no schema changes are needed, move to the next step. If you make changes to the schema, follow these steps to run migrations locally:

- Start the database container: `npm run compose:db` (**ensure Docker Desktop is running!**)
- Apply the migrations: `npm run migrate:local`

### 4. Initialization
- Start the dev containers `npm run compose:dev`
- Check the logs of the `api-gateway` container on Docker Desktop. When the Nest application is fully initialized, the application should be running at: `http://localhost:3000/`
- If you make changes in any of the services, restart the service using: `npm run compose:restart -- service-name`

### 5. Tests
- For unit tests, run: `npm run test`
- For end-to-end tests, run;

   * Start the test containers: `npm run compose:test`
   * Run the tests: `npm run test:e2e`

<br>

> If you make changes to any of the compose files in test or development, stop the containers using: `npm run compose:down`. Then, rebuild the docker images using: `npm run compose:build`

## Endpoints

### Auth API

| Method | Path                      | Description                        |
| ------ | ------------------------- | ---------------------------------- |
| POST   | /auth/signup              | Sign up a new user                 |
| POST   | /auth/login               | Sign in an existing user           |
| POST   | /auth/logout              | Sign out a logged in user          |
| POST   | /auth/2fa/enable          | Enable 2FA                         |
| POST   | /auth/2fa/disable         | Disable 2FA                        |
| POST   | /auth/2fa/verify          | Verify code from authenticator app |
| POST   | /auth/password/reset      | Request a password reset           |
| POST   | /auth/password/resend-otp | Resend password reset OTP          |
| POST   | /auth/password/verify-otp | Verify password reset OTP          |
| POST   | /auth/password/new        | Change current password            |
| GET    | /auth/metrics             | Retrieve auth-related metrics      |

### Admin API

| Method | Path            | Description                             |
| ------ | --------------- | --------------------------------------- |
| POST   | /admin/signup   | Create Super Admin profile              |
| POST   | /admin/login    | Sign in an existing admin               |
| GET    | /admin          | Retrieve all admins                     |
| POST   | /admin/add      | Add new admin                           |
| POST   | /admin/remove   | Remove existing admin                   |
| POST   | /admin/disputes | Retrieve all dispute chats for an admin |

### User API

| Method | Path                                    | Description                         |
| ------ | --------------------------------------- | ----------------------------------- |
| GET    | /user/profile                           | Get user profile                    |
| PATCH  | /user/profile                           | Update user profile                 |
| DELETE | /user/profile                           | Delete user profile                 |
| GET    | /user/wagers                            | Get all wagers for a user           |
| GET    | /user/transactions?chain=&status=&type= | Retrieve user transaction history   |
| POST   | /user/wallet/transfer                   | In-app funds transfer between users |

### Wagers API

| Method | Path                             | Description                            |
| ------ | -------------------------------- | -------------------------------------- |
| POST   | /wagers/create                   | Create new wager                       |
| POST   | /wagers/invite                   | Find wager by invite code              |
| GET    | /wagers/:wagerId                 | Get wager details                      |
| PATCH  | /wagers/:wagerId                 | Update wager details                   |
| POST   | /wagers/:wagerId/join            | Join a pending wager                   |
| POST   | /wagers/:wagerId/claim           | Claim wager prize                      |
| POST   | /wagers/:wagerId/claim/accept    | Accept wager prize claim               |
| POST   | /wagers/:wagerId/claim/contest   | Contest wager prize claim              |
| GET    | /wagers/:wagerId/dispute/chat    | Retrieve dispute chat messages         |
| GET    | /wagers/:wagerId/dispute/resolve | Assign winner after dispute resolution |
| DELETE | /wagers/:wagerId                 | Delete a pending wager                 |
| GET    | /wagers/metrics                  | Retrieve wager-related metrics         |

### Wallet API

| Method | Path             | Description                          |
| ------ | ---------------- | ------------------------------------ |
| GET    | /wallet/metrics  | Retrieve transaction-related metrics |
| PATCH  | /wallet/deposit  | Initiate deposit processing          |
| DELETE | /wallet/withdraw | Initiate withdrawal processing       |

Happy Wagering! :rocket:
