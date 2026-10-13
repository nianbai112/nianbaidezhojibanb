import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export function parseWecomXml(xml: unknown) {
  if (
    typeof xml !== "string" ||
    Buffer.byteLength(xml) > 65536 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new BadRequestException("企业微信回调格式错误");
  const value = new XMLParser({
    parseTagValue: false,
    trimValues: true,
    processEntities: false,
  }).parse(xml)?.xml;
  if (!value || typeof value !== "object")
    throw new BadRequestException("企业微信回调格式错误");
  return value;
}
export function decryptWecomCallback(
  query: any,
  encrypted: unknown,
  config: { corpId: string; callbackToken: string; encodingAESKey: string },
  now = Date.now(),
) {
  if (
    !config.callbackToken ||
    !/^[A-Za-z0-9+/]{43}$/.test(config.encodingAESKey)
  )
    throw new ForbiddenException("企业微信回调尚未配置");
  const { msg_signature: signature, timestamp, nonce } = query;
  if (
    typeof signature !== "string" ||
    !/^[a-f0-9]{40}$/i.test(signature) ||
    typeof timestamp !== "string" ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 600000 ||
    typeof nonce !== "string" ||
    !nonce ||
    nonce.length > 256 ||
    typeof encrypted !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted) ||
    encrypted.length > 90000
  )
    throw new ForbiddenException("企业微信回调签名无效");
  const expected = createHash("sha1")
    .update([config.callbackToken, timestamp, nonce, encrypted].sort().join(""))
    .digest("hex");
  if (
    !timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature.toLowerCase()),
    )
  )
    throw new ForbiddenException("企业微信回调签名无效");
  try {
    const key = Buffer.from(config.encodingAESKey + "=", "base64");
    const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
    decipher.setAutoPadding(false);
    const padded = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]);
    const padding = padded.at(-1)!;
    if (
      padding < 1 ||
      padding > 32 ||
      !padded.subarray(-padding).every((byte) => byte === padding)
    )
      throw new Error();
    const raw = padded.subarray(0, -padding);
    if (raw.length < 20) throw new Error();
    const end = 20 + raw.readUInt32BE(16);
    if (
      end < 21 ||
      end > raw.length ||
      raw.subarray(end).toString("utf8") !== config.corpId
    )
      throw new Error();
    return raw.subarray(20, end).toString("utf8");
  } catch {
    throw new ForbiddenException("企业微信回调解密失败");
  }
}
