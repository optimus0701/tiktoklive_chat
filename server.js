const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { WebcastPushConnection } = require("tiktok-live-connector");
const path = require("path");
// Thêm thư viện google-tts-api
// Bạn cần chạy: npm install google-tts-api
const googleTTS = require("google-tts-api");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

  // Helper tạo TikTok Live Connection được tối ưu tốc độ và bọc fast-API fetchRoomId
  function createOptimizedConnection(username) {
    const conn = new WebcastPushConnection(username, {
      processInitialData: false, // Bỏ qua lịch sử tin nhắn cũ
      enableExtendedGiftInfo: false, // Tải ngầm danh sách quà sau khi kết nối
      fetchRoomInfoOnConnect: false,
      requestPollingIntervalMs: 2000,
      webClientParams: {
        app_language: "vi-VN",
        device_platform: "web_pc",
      },
    });

    // Bỏ qua cào HTML SIGI_STATE (đã bị TikTok khai tử) -> gọi trực tiếp API lấy Room ID nhanh (1-3s)
    const originalFetchRoomId = conn.fetchRoomId.bind(conn);
    conn.fetchRoomId = async function () {
      try {
        const roomData = await this.webClient.fetchRoomInfoFromApiLive({ uniqueId: this.uniqueId });
        const roomId = roomData?.data?.user?.roomId;
        if (roomId) return roomId;
      } catch (e) {
        console.log("Fast API Room ID fetch failed, falling back to default...", e.message);
      }
      return originalFetchRoomId();
    };

    return conn;
  }

  // Lắng nghe sự kiện người dùng nhập Username từ frontend
  socket.on("join-room", (tiktokUsername) => {
    if (!tiktokUsername) return;

    console.log(`Đang kết nối tới: ${tiktokUsername}`);

    let isExplicitDisconnect = false;
    let isStreamEnded = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    let reconnectTimer = null;

    if (tiktokConnection) {
      isExplicitDisconnect = true;
      try {
        tiktokConnection.disconnect();
      } catch (e) {
        console.error("Lỗi ngắt kết nối cũ:", e);
      }
    }
    isExplicitDisconnect = false;

    tiktokConnection = createOptimizedConnection(tiktokUsername);

    const setupListeners = (conn) => {
      // 1. Chat
      conn.on("chat", (data) => {
        socket.emit("tiktok-event", { type: "chat", data: data });
      });

      // 2. Tặng quà (Gift)
      conn.on("gift", (data) => {
        if (data.giftType === 1 && !data.repeatEnd) {
          return;
        }
        socket.emit("tiktok-event", { type: "gift", data: data });
      });

      // 3. Like
      conn.on("like", (data) => {
        socket.emit("tiktok-event", { type: "like", data: data });
      });

      // 4. Follow
      conn.on("follow", (data) => {
        socket.emit("tiktok-event", { type: "follow", data: data });
      });

      // 5. Share
      conn.on("share", (data) => {
        socket.emit("tiktok-event", { type: "share", data: data });
      });

      // 6. Member tham gia
      conn.on("member", (data) => {
        socket.emit("tiktok-event", { type: "member", data: data });
      });

      // 7. Phát hiện Stream kết thúc thực sự từ server TikTok
      conn.on("streamEnd", () => {
        console.log(`TikTok Live của ${tiktokUsername} đã chính thức kết thúc.`);
        isStreamEnded = true;
        socket.emit("live-ended");
      });

      // 8. Xử lý ngắt kết nối (Push Gateway WebSocket timeout hoặc tụt mạng)
      conn.on("disconnected", () => {
        if (isExplicitDisconnect || isStreamEnded) {
          console.log(`Ngắt kết nối chính thức cho ${tiktokUsername}.`);
          return;
        }

        console.log(`Mất kết nối tạm thời với TikTok (${tiktokUsername}). Đang thử tự động kết nối lại...`);
        scheduleReconnect();
      });

      conn.on("error", (err) => {
        console.error("Lỗi TikTok Connection:", err?.info || err?.message || err);
      });
    };

    const attemptConnect = () => {
      tiktokConnection
        .connect()
        .then((state) => {
          reconnectAttempts = 0;
          console.log(`Đã kết nối thành công tới Room ID: ${state.roomId}`);
          socket.emit("connection-status", {
            status: "connected",
            roomId: state.roomId,
          });

          // Tải ngầm danh sách quà bổ sung sau khi đã kết nối nhanh
          tiktokConnection.fetchAvailableGifts()
            .then((gifts) => {
              tiktokConnection._availableGifts = gifts;
              console.log(`Tải thành công ${gifts?.length || 0} thông tin quà ngầm.`);
            })
            .catch(() => {});
        })
        .catch((err) => {
          console.error("Lỗi kết nối TikTok:", err?.message || err);
          if (reconnectAttempts === 0) {
            socket.emit("connection-status", {
              status: "error",
              message: err.message || "Không tìm thấy user hoặc chưa live.",
            });
          } else {
            scheduleReconnect();
          }
        });
    };

    const scheduleReconnect = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (isExplicitDisconnect || isStreamEnded) return;

      if (reconnectAttempts >= maxReconnectAttempts) {
        console.log(`Đã thử kết nối lại ${maxReconnectAttempts} lần không thành công.`);
        socket.emit("connection-status", {
          status: "error",
          message: "Mất kết nối kéo dài và không thể tự động khôi phục.",
        });
        socket.emit("live-ended");
        return;
      }

      reconnectAttempts++;
      const delay = Math.min(2000 * Math.pow(1.3, reconnectAttempts), 10000);
      console.log(`Thử kết nối lại lần ${reconnectAttempts}/${maxReconnectAttempts} sau ${Math.round(delay)}ms...`);

      socket.emit("connection-status", {
        status: "reconnecting",
        attempt: reconnectAttempts,
        maxAttempts: maxReconnectAttempts,
      });

      reconnectTimer = setTimeout(() => {
        if (isExplicitDisconnect || isStreamEnded) return;
        // Tạo instance mới để reset WS client state sạch sẽ
        try {
          tiktokConnection.disconnect();
        } catch (e) {}

        tiktokConnection = createOptimizedConnection(tiktokUsername);
        setupListeners(tiktokConnection);
        attemptConnect();
      }, delay);
    };

    setupListeners(tiktokConnection);
    attemptConnect();

    socket.on("disconnect", () => {
      isExplicitDisconnect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
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
