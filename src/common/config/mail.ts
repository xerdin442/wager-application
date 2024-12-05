import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../logger';

export const sendEmail = async (receiver: any, subject: string, content: string): Promise<void> => {  
  const context = sendEmail.name

  // Generate HTML from email content
  const $ = cheerio.load(content)
  const htmlContent = $.html()

  const data = {
    sender: {
      name: new ConfigService().get<string>('APP_NAME'),
      email: new ConfigService().get<string>('APP_EMAIL'),
    },
    to: [
      {
        email: `${receiver.email}`,
        name: `${receiver?.firstName}`
      },
    ],
    subject,
    htmlContent
  };

  try {
    const url = 'https://api.brevo.com/v3/smtp/email';
    const response = await axios.post(url, data, {
      headers: {
        'accept': 'application/json',
        'api-key': new ConfigService().get<string>('BREVO_API_KEY'),
        'content-type': 'application/json'
      },
    });

    logger.info(`[${context}] "${subject}" email sent to ${receiver.email}. Email ID: ${response.data}\n`);
  } catch (error) {
    logger.error(`[${context}] An error occured while sending "${subject}" email to ${receiver.email}. Error: ${error.message}\n`);
    
    throw error;
  }
}