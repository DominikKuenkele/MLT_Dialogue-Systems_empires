FROM node:alpine
RUN npm install -g serve
WORKDIR '/app'
ADD . .
RUN yarn install
RUN yarn build
EXPOSE 3000
CMD ["serve", "-s", "build"]