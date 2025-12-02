# TikTok Live Chat Scraper 🎥💬

[![Python](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![TikTokLive](https://img.shields.io/badge/Library-TikTokLive-pink.svg)](https://github.com/isaackogan/TikTokLive)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**tiktoklive_chat** là một công cụ mã nguồn mở giúp bạn kết nối và lấy dữ liệu tương tác thời gian thực (real-time) từ các buổi phát trực tiếp trên TikTok (TikTok Live). Dự án này được thiết kế để dễ dàng tích hợp vào các hệ thống khác như OBS, chatbot, hoặc lưu trữ dữ liệu để phân tích.

## 🚀 Tính năng

* **Kết nối không cần đăng nhập:** Chỉ cần TikTok Username (unique_id).
* **Real-time Chat:** Nhận tin nhắn bình luận của người xem ngay lập tức.
* **Sự kiện đa dạng:** Hỗ trợ bắt sự kiện Tặng quà (Gift), Thả tim (Like), Tham gia phòng (Join), và Chia sẻ (Share).
* **Dễ dàng mở rộng:** Có thể kết hợp với Flask/FastAPI để tạo API hoặc Webhook.
* **Nhẹ & Nhanh:** Tối ưu hóa để chạy trên cả máy cấu hình thấp hoặc VPS.

## 🛠️ Yêu cầu hệ thống

* Python 3.8 trở lên.
* Kết nối Internet ổn định.
* Thư viện: `TikTokLive` (và các dependencies liên quan).

## 📦 Cài đặt

1.  **Clone repository này về máy:**
    ```bash
    git clone [https://github.com/optimus0701/tiktoklive_chat.git](https://github.com/optimus0701/tiktoklive_chat.git)
    cd tiktoklive_chat
    ```

2.  **Tạo môi trường ảo (Khuyên dùng):**
    ```bash
    python -m venv venv
    # Windows:
    venv\Scripts\activate
    # macOS/Linux:
    source venv/bin/activate
    ```

3.  **Cài đặt các thư viện cần thiết:**
    ```bash
    pip install -r requirements.txt
    ```
    *(Nếu chưa có file `requirements.txt`, bạn có thể cài thủ công: `pip install TikTokLive`)*

## 📖 Hướng dẫn sử dụng

### 1. Cấu hình
Mở file `main.py` (hoặc file chạy chính của bạn) và chỉnh sửa `unique_id` thành ID của kênh TikTok bạn muốn theo dõi.

Ví dụ: Nếu link là `tiktok.com/@domi_vlr`, thì `unique_id` là `domi_vlr`.

### 2. Chạy tool
Chạy lệnh sau trong terminal:

```bash
python main.py
