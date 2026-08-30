import { UploadController } from "./upload.controller";

describe("UploadController user delivery proof", () => {
  it("preserves the delivery-proof scene and requires an ownership record", async () => {
    const result = {
      url: "https://cdn.example.com/proof.jpg",
      key: "users/user-1/delivery-proofs/orders/order-1/proof.jpg",
      size: 1024,
      mimeType: "image/jpeg",
      type: "image",
    };
    const uploadService = {
      resolveFolder: jest.fn().mockReturnValue("users/user-1/delivery-proofs"),
      upload: jest.fn().mockResolvedValue(result),
      recordUpload: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new UploadController(uploadService as any, {} as any);
    const file = {
      originalname: "proof.jpg",
      mimetype: "image/jpeg",
    } as Express.Multer.File;

    await expect(
      controller.uploadImage(file, "user-1", "delivery-proof", "order-1"),
    ).resolves.toEqual(result);
    expect(uploadService.resolveFolder).toHaveBeenCalledWith(
      "delivery-proof",
      "user-1",
    );
    expect(uploadService.upload).toHaveBeenCalledWith(file, {
      type: "image",
      folder: "users/user-1/delivery-proofs/orders/order-1",
      scene: "delivery-proof",
    });
    expect(uploadService.recordUpload).toHaveBeenCalledWith(
      "user-1",
      "user",
      result,
      "delivery-proof",
      undefined,
      true,
    );
  });

  it("rejects an unbound delivery-proof upload before storing the file", async () => {
    const uploadService = {
      resolveFolder: jest.fn().mockReturnValue("users/user-1/delivery-proofs"),
      upload: jest.fn(),
    };
    const controller = new UploadController(uploadService as any, {} as any);
    const file = {
      originalname: "proof.jpg",
      mimetype: "image/jpeg",
    } as Express.Multer.File;

    await expect(
      controller.uploadImage(file, "user-1", "delivery-proof"),
    ).rejects.toThrow("送达凭证必须绑定有效订单");
    expect(uploadService.upload).not.toHaveBeenCalled();
  });
});
