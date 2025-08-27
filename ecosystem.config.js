module.exports = {
  apps: [{
    name: "server",
    script: "./server.js",
    env: {
      NODE_ENV: "production",
      PORT: 5000,
      TOKEN_SECRET: "3f7d5e1c9b2a8f4e6d0c7b5a9e2f3d1a8c4e6f7b9d2a5e1c3f8d7b6a4e9c2f5",
      CLIENT_URL: "https://kesbiz.net",
      BASE_URL: "https://kesbiz.net"
    }
  }]
}
