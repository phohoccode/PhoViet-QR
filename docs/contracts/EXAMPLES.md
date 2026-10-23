# JSON examples v0.1 — handoff Gemini

Tất cả ID/timestamp/link là dữ liệu giả; ngày vận hành 23/10/2026, timezone quán Asia/Ho_Chi_Minh (UTC+7). Mỗi fence là JSON độc lập, có chú thích `contract` ghi type import từ `types.ts`. Envelope đúng ARCHITECTURE. Chạy `python docs/contracts/validate_contracts.py` để parse JSON, compile examples và kiểm invariant tĩnh; không cần cài package.

Các fence là snapshot ở những thời điểm khác nhau. Public resolve/menu khác response theo guest scope/owner auth: public API không có nghĩa ai cũng được đọc dữ liệu đơn. Secret phiên, guest token, provider secret và mã lấy món không có trong JSON. Protocol cấp/hiển thị lại mã lấy món cho người được ủy quyền còn cần chốt ở Q5; không tạo fixture mã nhận món công khai.

## 1. QR bàn — trước khi xác thực

Public resolve chỉ định danh bàn; không tiết lộ phiên dù bàn đang có khách.

<!-- contract: ApiSuccess<QRResolution> -->
```json
{
  "data": {
    "type": "table",
    "mode": "dine_in",
    "store": {
      "id": "store-demo",
      "name": "Quán Demo",
      "timezone": "Asia/Ho_Chi_Minh",
      "acceptingOrders": true
    },
    "table": {
      "id": "table-05",
      "label": "Bàn 05"
    },
    "requiresSessionCode": true,
    "session": null
  },
  "error": null
}
```

## 2. QR bàn còn phiên — đã xác thực

Chỉ trả sau verify thành công và kiểm guest scope session-05. Không có mã phiên hoặc token trong body.

<!-- contract: ApiSuccess<QRResolution> -->
```json
{
  "data": {
    "type": "table",
    "mode": "dine_in",
    "store": {
      "id": "store-demo",
      "name": "Quán Demo",
      "timezone": "Asia/Ho_Chi_Minh",
      "acceptingOrders": true
    },
    "table": {
      "id": "table-05",
      "label": "Bàn 05"
    },
    "requiresSessionCode": false,
    "session": {
      "id": "session-05",
      "status": "open"
    }
  },
  "error": null
}
```

## 3. QR quầy

Public resolve không cần phiên bàn và không cấp quyền xem đơn mang đi khác.

<!-- contract: ApiSuccess<QRResolution> -->
```json
{
  "data": {
    "type": "takeaway",
    "mode": "takeaway",
    "store": {
      "id": "store-demo",
      "name": "Quán Demo",
      "timezone": "Asia/Ho_Chi_Minh",
      "acceptingOrders": true
    },
    "table": null,
    "requiresSessionCode": false,
    "session": null
  },
  "error": null
}
```

## 4. Menu: options và hết món

Active nhưng available=false vẫn render hết hàng; inactive bị lọc khỏi menu public. Ảnh null dùng placeholder UI.

<!-- contract: ApiSuccess<MenuView> -->
```json
{
  "data": {
    "categories": [
      {
        "id": "category-coffee",
        "name": "Cà phê",
        "sortOrder": 1
      }
    ],
    "items": [
      {
        "id": "item-coffee",
        "categoryId": "category-coffee",
        "name": "Cà phê sữa",
        "description": "Pha phin",
        "priceVnd": 29000,
        "imageUrl": null,
        "available": true,
        "options": [
          {
            "id": "option-extra",
            "name": "Thêm cà phê",
            "priceDeltaVnd": 6000,
            "available": true
          }
        ],
        "updatedAt": "2026-10-23T02:00:00Z"
      },
      {
        "id": "item-bacxiu",
        "categoryId": "category-coffee",
        "name": "Bạc xỉu",
        "description": null,
        "priceVnd": 35000,
        "imageUrl": null,
        "available": false,
        "options": [],
        "updatedAt": "2026-10-23T02:01:00Z"
      }
    ]
  },
  "error": null
}
```

## 5. Giỏ / request chỉ gửi ý định

Cookie phiên gửi ngoài body. Không có giá, paid, ticket hoặc state do khách quyết định. Quote protocol còn mở ở Q3.

<!-- contract: CreateOrderInput -->
```json
{
  "qrCode": "TABLE_05_PUBLIC",
  "clientRequestId": "22d0ab58-300e-4f3a-ae7e-a4cc92238a49",
  "items": [
    {
      "menuItemId": "item-coffee",
      "quantity": 1,
      "optionIds": [],
      "note": "Ít đá"
    }
  ],
  "note": null
}
```

## 6. Dine-in accepted, có ticket

Guest session-05 hoặc owner đúng quán. payment.amountVnd trong OrderDetail là tiền order; tổng bill phiên ở TableSessionDetail.

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{
  "data": {
    "id": "order-A",
    "storeId": "store-demo",
    "type": "dine_in",
    "tableSessionId": "session-05",
    "table": {
      "id": "table-05",
      "label": "Bàn 05"
    },
    "status": "accepted",
    "statusLabel": "Chờ làm",
    "ticketNo": 28,
    "serviceDate": "2026-10-23",
    "acceptedAt": "2026-10-23T03:00:00Z",
    "paymentStatus": "unpaid",
    "fulfillmentStatus": "awaiting_preparation",
    "totalVnd": 29000,
    "itemCount": 1,
    "createdAt": "2026-10-23T03:00:00Z",
    "updatedAt": "2026-10-23T03:00:00Z",
    "version": 1,
    "lines": [
      {
        "id": "line-A",
        "menuItemId": "item-coffee",
        "name": "Cà phê sữa",
        "baseUnitPriceVnd": 29000,
        "options": [],
        "unitPriceVnd": 29000,
        "quantity": 1,
        "lineTotalVnd": 29000,
        "note": null
      }
    ],
    "note": null,
    "payment": {
      "kind": "table_session",
      "tableSessionId": "session-05",
      "intentId": null,
      "intentStatus": null,
      "status": "unpaid",
      "statusLabel": "Chưa thanh toán",
      "amountVnd": 29000,
      "currency": "VND",
      "updatedAt": "2026-10-23T03:00:00Z",
      "reconciliationRequired": false
    }
  },
  "error": null
}
```

## 7. Một phiên bàn, hai order

Snapshot trước khi khách C gọi thêm trong DOMAIN_MODEL. Hai ticket 28/30; ticket 29 là takeaway xen giữa, không cộng vào bill 87.000 VND. Guest cùng phiên được xem cả hai đơn.

<!-- contract: ApiSuccess<TableSessionDetail> -->
```json
{
  "data": {
    "table": {
      "id": "table-05",
      "label": "Bàn 05"
    },
    "session": {
      "id": "session-05",
      "status": "open",
      "openedAt": "2026-10-23T02:50:00Z",
      "closedAt": null,
      "orderCount": 2,
      "totalVnd": 87000,
      "paymentStatus": "unpaid",
      "version": 3
    },
    "orders": [
      {
        "id": "order-A",
        "storeId": "store-demo",
        "type": "dine_in",
        "tableSessionId": "session-05",
        "table": {
          "id": "table-05",
          "label": "Bàn 05"
        },
        "status": "accepted",
        "statusLabel": "Chờ làm",
        "ticketNo": 28,
        "serviceDate": "2026-10-23",
        "acceptedAt": "2026-10-23T03:00:00Z",
        "paymentStatus": "unpaid",
        "fulfillmentStatus": "awaiting_preparation",
        "totalVnd": 29000,
        "itemCount": 1,
        "createdAt": "2026-10-23T03:00:00Z",
        "updatedAt": "2026-10-23T03:00:00Z",
        "version": 1
      },
      {
        "id": "order-B",
        "storeId": "store-demo",
        "type": "dine_in",
        "tableSessionId": "session-05",
        "table": {
          "id": "table-05",
          "label": "Bàn 05"
        },
        "status": "accepted",
        "statusLabel": "Chờ làm",
        "ticketNo": 30,
        "serviceDate": "2026-10-23",
        "acceptedAt": "2026-10-23T03:00:02Z",
        "paymentStatus": "unpaid",
        "fulfillmentStatus": "awaiting_preparation",
        "totalVnd": 58000,
        "itemCount": 2,
        "createdAt": "2026-10-23T03:00:02Z",
        "updatedAt": "2026-10-23T03:00:02Z",
        "version": 1
      }
    ]
  },
  "error": null
}
```

## 8. Owner grid bàn

Owner-only, không phải danh sách bàn/phiên công khai.

<!-- contract: ApiSuccess<TableSummary[]> -->
```json
{
  "data": [
    {
      "id": "table-05",
      "label": "Bàn 05",
      "active": true,
      "session": {
        "id": "session-05",
        "status": "open",
        "openedAt": "2026-10-23T02:50:00Z",
        "closedAt": null,
        "orderCount": 2,
        "totalVnd": 87000,
        "paymentStatus": "unpaid",
        "version": 3
      }
    },
    {
      "id": "table-06",
      "label": "Bàn 06",
      "active": true,
      "session": null
    }
  ],
  "error": null
}
```

## 9. Takeaway trước thanh toán — không ticket

Chỉ guest order-T hoặc owner. provider.example là link minh họa, chưa chọn provider. Không có pickup secret; không cache/log response công khai.

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{
  "data": {
    "id": "order-T",
    "storeId": "store-demo",
    "type": "takeaway",
    "tableSessionId": null,
    "table": null,
    "status": "pending_payment",
    "statusLabel": "Chờ thanh toán",
    "ticketNo": null,
    "serviceDate": null,
    "acceptedAt": null,
    "paymentStatus": "pending",
    "fulfillmentStatus": "awaiting_preparation",
    "totalVnd": 35000,
    "itemCount": 1,
    "createdAt": "2026-10-23T02:59:00Z",
    "updatedAt": "2026-10-23T02:59:00Z",
    "version": 1,
    "payment": {
      "kind": "takeaway",
      "intentId": "intent-T",
      "intentStatus": "pending",
      "status": "pending",
      "statusLabel": "Đang xác nhận thanh toán",
      "amountVnd": 35000,
      "currency": "VND",
      "expiresAt": "2026-10-23T03:09:00Z",
      "checkoutUrl": "https://provider.example/checkout/demo-intent-T",
      "qrPayload": null,
      "updatedAt": "2026-10-23T02:59:00Z",
      "reconciliationRequired": false
    },
    "lines": [
      {
        "id": "line-T",
        "menuItemId": "item-coffee",
        "name": "Cà phê sữa",
        "baseUnitPriceVnd": 29000,
        "options": [
          {
            "menuOptionId": "option-extra",
            "name": "Thêm cà phê",
            "priceDeltaVnd": 6000
          }
        ],
        "unitPriceVnd": 35000,
        "quantity": 1,
        "lineTotalVnd": 35000,
        "note": null
      }
    ],
    "note": null
  },
  "error": null
}
```

## 10. Cùng takeaway sau webhook verified

Snapshot SAU ví dụ 9 của cùng order-T. DB acceptance lúc 03:00:01Z tạo ticket 29, nằm giữa A/B. Return URL không thể tạo trạng thái này.

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{
  "data": {
    "id": "order-T",
    "storeId": "store-demo",
    "type": "takeaway",
    "tableSessionId": null,
    "table": null,
    "status": "accepted",
    "statusLabel": "Chờ làm",
    "ticketNo": 29,
    "serviceDate": "2026-10-23",
    "acceptedAt": "2026-10-23T03:00:01Z",
    "paymentStatus": "paid",
    "fulfillmentStatus": "awaiting_preparation",
    "totalVnd": 35000,
    "itemCount": 1,
    "createdAt": "2026-10-23T02:59:00Z",
    "updatedAt": "2026-10-23T03:00:01Z",
    "version": 2,
    "payment": {
      "kind": "takeaway",
      "intentId": "intent-T",
      "intentStatus": "succeeded",
      "status": "paid",
      "statusLabel": "Đã thanh toán",
      "amountVnd": 35000,
      "currency": "VND",
      "expiresAt": "2026-10-23T03:09:00Z",
      "updatedAt": "2026-10-23T03:00:01Z",
      "reconciliationRequired": false
    },
    "lines": [
      {
        "id": "line-T",
        "menuItemId": "item-coffee",
        "name": "Cà phê sữa",
        "baseUnitPriceVnd": 29000,
        "options": [
          {
            "menuOptionId": "option-extra",
            "name": "Thêm cà phê",
            "priceDeltaVnd": 6000
          }
        ],
        "unitPriceVnd": 35000,
        "quantity": 1,
        "lineTotalVnd": 35000,
        "note": null
      }
    ],
    "note": null
  },
  "error": null
}
```

## 11. Owner queue: hai loại và ready

Snapshot sau ví dụ 7/10: A đã claim trước T; T đã claim và ready; B còn accepted. Nhận tiếp chọn B. Sort ticket 28/29/30; không có pending_payment/payment_exception hay mã nhận món.

<!-- contract: ApiSuccess<OwnerQueueView> -->
```json
{
  "data": {
    "storeId": "store-demo",
    "orders": [
      {
        "id": "order-A",
        "storeId": "store-demo",
        "type": "dine_in",
        "tableSessionId": "session-05",
        "table": {
          "id": "table-05",
          "label": "Bàn 05"
        },
        "status": "preparing",
        "statusLabel": "Đang làm",
        "ticketNo": 28,
        "serviceDate": "2026-10-23",
        "acceptedAt": "2026-10-23T03:00:00Z",
        "paymentStatus": "unpaid",
        "fulfillmentStatus": "preparing",
        "totalVnd": 29000,
        "itemCount": 1,
        "createdAt": "2026-10-23T03:00:00Z",
        "updatedAt": "2026-10-23T03:01:00Z",
        "version": 2
      },
      {
        "id": "order-T",
        "storeId": "store-demo",
        "type": "takeaway",
        "tableSessionId": null,
        "table": null,
        "status": "ready",
        "statusLabel": "Sẵn sàng",
        "ticketNo": 29,
        "serviceDate": "2026-10-23",
        "acceptedAt": "2026-10-23T03:00:01Z",
        "paymentStatus": "paid",
        "fulfillmentStatus": "ready",
        "totalVnd": 35000,
        "itemCount": 1,
        "createdAt": "2026-10-23T02:59:00Z",
        "updatedAt": "2026-10-23T03:05:00Z",
        "version": 4
      },
      {
        "id": "order-B",
        "storeId": "store-demo",
        "type": "dine_in",
        "tableSessionId": "session-05",
        "table": {
          "id": "table-05",
          "label": "Bàn 05"
        },
        "status": "accepted",
        "statusLabel": "Chờ làm",
        "ticketNo": 30,
        "serviceDate": "2026-10-23",
        "acceptedAt": "2026-10-23T03:00:02Z",
        "paymentStatus": "unpaid",
        "fulfillmentStatus": "awaiting_preparation",
        "totalVnd": 58000,
        "itemCount": 2,
        "createdAt": "2026-10-23T03:00:02Z",
        "updatedAt": "2026-10-23T03:00:02Z",
        "version": 1
      }
    ],
    "nextCursor": null,
    "updatedAt": "2026-10-23T03:05:00Z"
  },
  "error": null
}
```

## 12. Tiền về muộn, không tự vào bếp

Evidence do server giữ. Guest đúng order thấy cần đối soát, không có ticket hoặc raw webhook.

<!-- contract: ApiSuccess<OrderDetail> -->
```json
{
  "data": {
    "id": "order-late",
    "storeId": "store-demo",
    "type": "takeaway",
    "tableSessionId": null,
    "table": null,
    "status": "payment_exception",
    "statusLabel": "Cần đối soát thanh toán",
    "ticketNo": null,
    "serviceDate": null,
    "acceptedAt": null,
    "paymentStatus": "exception",
    "fulfillmentStatus": "awaiting_preparation",
    "totalVnd": 29000,
    "itemCount": 1,
    "createdAt": "2026-10-23T02:00:00Z",
    "updatedAt": "2026-10-23T02:12:00Z",
    "version": 1,
    "lines": [
      {
        "id": "line-late",
        "menuItemId": "item-coffee",
        "name": "Cà phê sữa",
        "baseUnitPriceVnd": 29000,
        "options": [],
        "unitPriceVnd": 29000,
        "quantity": 1,
        "lineTotalVnd": 29000,
        "note": null
      }
    ],
    "note": null,
    "payment": {
      "kind": "takeaway",
      "intentId": "intent-late",
      "intentStatus": "exception",
      "status": "exception",
      "statusLabel": "Cần đối soát",
      "amountVnd": 29000,
      "currency": "VND",
      "expiresAt": "2026-10-23T02:10:00Z",
      "updatedAt": "2026-10-23T02:12:00Z",
      "reconciliationRequired": true
    }
  },
  "error": null
}
```

## 13. Lỗi SESSION_EXPIRED

HTTP 410. Không trả secret hoặc dấu vết SQL.

<!-- contract: ApiFailure -->
```json
{
  "data": null,
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "Phiên bàn không còn hiệu lực. Vui lòng liên hệ quán."
  }
}
```

## 14. Lỗi OUT_OF_STOCK

HTTP 409. Client cần kiểm tra lại giỏ.

<!-- contract: ApiFailure -->
```json
{
  "data": null,
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Một số món vừa hết. Vui lòng kiểm tra lại giỏ.",
    "details": {
      "menuItemIds": [
        "item-bacxiu"
      ]
    }
  }
}
```

## 15. Lỗi PRICE_CHANGED

HTTP 409. Ví dụ lỗi sau khi có stale quote protocol Q3; chưa khẳng định request v0.1 hiện phát hiện được giá khách từng thấy.

<!-- contract: ApiFailure -->
```json
{
  "data": null,
  "error": {
    "code": "PRICE_CHANGED",
    "message": "Giá món đã đổi. Vui lòng xác nhận lại giỏ.",
    "details": {
      "currentPrices": [
        {
          "menuItemId": "item-coffee",
          "priceVnd": 31000
        }
      ]
    }
  }
}
```

## 16. Lỗi PAYMENT_PENDING

HTTP 409 cho command đòi thanh toán đã xác nhận. GET payment pending thường trả 200 PaymentViewState.

<!-- contract: ApiFailure -->
```json
{
  "data": null,
  "error": {
    "code": "PAYMENT_PENDING",
    "message": "Đang xác nhận thanh toán. Vui lòng không trả tiền lần nữa.",
    "details": {
      "retryAfterSeconds": 5
    }
  }
}
```

## 17. Lỗi FORBIDDEN

HTTP 403. Không tiết lộ tài nguyên ngoài scope.

<!-- contract: ApiFailure -->
```json
{
  "data": null,
  "error": {
    "code": "FORBIDDEN",
    "message": "Bạn không có quyền truy cập nội dung này."
  }
}
```

## 18. Lỗi SESSION_CHECKOUT_PENDING

HTTP 409. Khóa gọi thêm khi đang thu tiền.

<!-- contract: ApiFailure -->
```json
{
  "data": null,
  "error": {
    "code": "SESSION_CHECKOUT_PENDING",
    "message": "Bàn đang thu tiền. Vui lòng liên hệ quán nếu muốn gọi thêm."
  }
}
```

## 19. Order đã giao tại quầy

Snapshot tiếp theo của order-T sau verify+consume pickup và complete atomic. Response không lặp lại mã nhận món.

<!-- contract: ApiSuccess<OrderSummary> -->
```json
{
  "data": {
    "id": "order-T",
    "storeId": "store-demo",
    "type": "takeaway",
    "tableSessionId": null,
    "table": null,
    "status": "completed",
    "statusLabel": "Đã giao",
    "ticketNo": 29,
    "serviceDate": "2026-10-23",
    "acceptedAt": "2026-10-23T03:00:01Z",
    "paymentStatus": "paid",
    "fulfillmentStatus": "collected",
    "totalVnd": 35000,
    "itemCount": 1,
    "createdAt": "2026-10-23T02:59:00Z",
    "updatedAt": "2026-10-23T03:06:00Z",
    "version": 5
  },
  "error": null
}
```

