import { IsNotEmpty, IsOptional, IsString } from "class-validator"

export class CreateBookmarkDto {
  @IsString()
  @IsNotEmpty()
  title: string

  @IsString()
  @IsNotEmpty()
  description: string
  
  @IsString()
  @IsOptional()
  link?: string
};

export class UpdateBookmarkDto {
  @IsString()
  @IsOptional()
  title?: string

  @IsString()
  @IsOptional()
  description?: string
  
  @IsString()
  @IsOptional()
  link?: string
}