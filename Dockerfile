FROM node:latest
WORKDIR /usr/src/app
COPY package.json .

ARG NODE_ENV
RUN if [ "$NODE_ENV" = "development" ]; \
      then npm install -f; \
      else npm install -f --only=production; \
      fi

COPY . .
EXPOSE 3000
CMD [ "npm", "start" ]