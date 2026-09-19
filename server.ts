import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    socket.on("room:join", ({ roomId }) => {
      socket.join(roomId);
      console.log(`${socket.id} joined ${roomId}`);
    });
  });

  httpServer.listen(3000, () => console.log("> http://localhost:3000"));
});