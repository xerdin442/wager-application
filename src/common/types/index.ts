export type SessionData = {
  email?: string
  otp?: string
  otpExpiration?: number
}

export type EmailAttachment = {
  content: string
  name: string
}

export type CloudinaryResource = {
  asset_id: string
  public_id: string
  format: string
  version: number
  resource_type: string
  type: string
  created_at: string
  bytes: number
  width?: number
  height?: number
  asset_folder: string
  display_name: string
  url: string
  secure_url: string
  tags?: string[]
  next_cursor?: string
}