import * as cheerio from 'cheerio';
import { GoogleAuthCallbackData } from '../types';

export const selectGoogleCallbackUrl = (): string => {
  const NODE_ENV = process.env.NODE_ENV as string;

  if (NODE_ENV === 'development' || NODE_ENV === 'test') {
    return 'http://localhost:3000/api/auth/google/callback';
  }

  return process.env.GOOGLE_CALLBACK_URL as string;
};

export function generateCallbackHtml(data: GoogleAuthCallbackData): string {
  // Use Cheerio to create a simple HTML structure
  const $ = cheerio.load(
    '<!DOCTYPE html><html><head><title>Authentication Successful!</title></head><body></body></html>',
  );

  // Add the script tag to the head or body
  const scriptContent = `
      const authResult = {
        user: ${JSON.stringify(data.user)},
        token: ${JSON.stringify(data.token)},
        redirectUrl: ${JSON.stringify(data.redirectUrl || '/')}
      };

      const frontendOrigin = ${JSON.stringify(data.frontendOrigin)};

      if (window.opener) {
        try {
          window.opener.postMessage(authResult, frontendOrigin);
        } catch (e) {
          console.error('Error sending message to opener:', e);
        } finally {
          window.close();
        }
      } else {
        console.warn('Authentication window opened directly, cannot post message to opener.');
      }
  `;

  // Create a script element and add the content
  const scriptElement = $('<script>').html(scriptContent);
  $('body').append(scriptElement);

  // Optional message if JavaScript is disabled
  const noscriptElement = $('<noscript>').html(
    '<p>Authentication complete. Please close this window.</p>',
  );
  $('body').append(noscriptElement);

  return $.html();
}
