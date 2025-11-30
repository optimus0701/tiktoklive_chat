const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { WebcastPushConnection } = require("tiktok-live-connector");
const { SignConfig } = require('tiktok-live-connector');


const path = require("path");
// Thêm thư viện google-tts-api
// Bạn cần chạy: npm install google-tts-api
const googleTTS = require("google-tts-api");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

SignConfig.apiKey = 'euler_YmRjMjRkNTgzNDU5MmFjMjM1Mjc3ZDZlZjVjZWZiNWVlODhkZGRkMWU4YzczOTYzOWZiMjY3';

// Serve file static từ thư mục public
app.use(express.static(path.join(__dirname, "public")));

// Xử lý kết nối Socket.io từ trình duyệt
io.on("connection", (socket) => {
  console.log("Frontend đã kết nối ID:", socket.id);
  let tiktokConnection = null;

  // --- XỬ LÝ TTS REQUEST TỪ CLIENT (CẬP NHẬT FIX CORB) ---
  socket.on("request-tts", async (text) => {
    if (!text) return;

    try {
      // Thay đổi: Dùng getAllAudioBase64 để tải file về server trước
      // giúp tránh lỗi CORB/CORS ở trình duyệt
      const audioData = await googleTTS.getAllAudioBase64(text, {
        lang: "vi",
        slow: false,
        host: "https://translate.google.com",
        splitPunct: ",.?!",
        timeout: 10000,
      });

      // Trả về dữ liệu Base64 cho client
      socket.emit("tts-response", audioData);
    } catch (error) {
      console.error("Lỗi tạo TTS:", error);
    }
  });

  // Lắng nghe sự kiện người dùng nhập Username từ frontend
  socket.on("join-room", (tiktokUsername) => {
    if (!tiktokUsername) return;

    console.log(`Đang kết nối tới: ${tiktokUsername}`);

    if (tiktokConnection) {
      try {
        tiktokConnection.disconnect();
      } catch (e) {
        console.error("Lỗi ngắt kết nối cũ:", e);
      }
    }

    // Cập nhật cấu hình: Tối ưu hóa kết nối
    tiktokConnection = new WebcastPushConnection(tiktokUsername, {
      processInitialData: false, // QUAN TRỌNG: Bỏ qua các tin nhắn cũ/lịch sử khi vừa kết nối
      enableExtendedGiftInfo: true, // Bật thông tin quà chi tiết (để lấy icon quà)
      enableWebsocketUpgrade: true,
      requestPollingIntervalMs: 2000,
      clientParams: {
        app_language: "vi-VN",
        device_platform: "web_pc",
      },
      sessionId: "f19ca4dbe83a8f0f4b637af3eeea7879",
      ttTargetIdc: "alisg"
    });

    tiktokConnection
      .connect()
      .then((state) => {
        console.log(`Đã kết nối tới Room ID: ${state.roomId}`);
        socket.emit("connection-status", {
          status: "connected",
          roomId: state.roomId,
        });
      })
      .catch((err) => {
        console.error("Lỗi kết nối TikTok:", err);
        socket.emit("connection-status", {
          status: "error",
          message: err.message || "Không tìm thấy user hoặc chưa live.",
        });
      });

    // 1. Chat
    tiktokConnection.on("chat", (data) => {
      socket.emit("tiktok-event", { type: "chat", data: data });
    });

    // 2. Tặng quà (Gift)
    tiktokConnection.on("gift", (data) => {
      if (data.giftType === 1 && !data.repeatEnd) {
        return;
      }
      socket.emit("tiktok-event", { type: "gift", data: data });
    });

    // 3. Like
    tiktokConnection.on("like", (data) => {
      socket.emit("tiktok-event", { type: "like", data: data });
    });

    // 4. Follow
    tiktokConnection.on("follow", (data) => {
      socket.emit("tiktok-event", { type: "follow", data: data });
    });

    // 5. Share
    tiktokConnection.on("share", (data) => {
      socket.emit("tiktok-event", { type: "share", data: data });
    });
    // 6. Member tham gia (Thêm đoạn này vào server.js)
    tiktokConnection.on("member", (data) => {
      socket.emit("tiktok-event", { type: "member", data: data });
    });

    socket.on("disconnect", () => {
      if (tiktokConnection) {
        tiktokConnection.disconnect();
        console.log("Đã ngắt kết nối TikTok do client thoát.");
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
