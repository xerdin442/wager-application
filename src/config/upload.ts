import { ConfigService } from "@nestjs/config";
import { v2 } from "cloudinary";
import { Request } from "express";
import { FileFilterCallback } from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";

export class UploadConfig {
  constructor(private readonly config: ConfigService) {
    v2.config({
      cloud_name: this.config.get<string>('CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUD_API_KEY'),
      api_secret: this.config.get<string>('CLOUD_API_SECRET'),
      secure: true
    });
  };

  storage(folder: string, type: 'image' | 'raw'): CloudinaryStorage {
    const storage = new CloudinaryStorage({
      cloudinary: v2,
      params: (req, file) => {
        return {
          folder: folder,
          public_id: new Date().toISOString().replace(/:/g, '-') + '-' + file.originalname,
          resource_type: type
        };
      }
    })

    return storage;
  };

  fileFilter(req: Request, file: Express.Multer.File, callback: FileFilterCallback): void {
    const allowedMimetypes: string[] = ['image/png', 'image/heic', 'image/jpeg', 'image/webp', 'image/heif', 'application/pdf'];
    
    if (allowedMimetypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  }
}