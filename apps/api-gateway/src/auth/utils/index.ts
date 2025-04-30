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
    '<!DOCTYPE html><html><head><title>Success</title></head><body></body></html>',
  );

  const mainContent = `
    <div class="container">
      <h1 class="text-2xl font-bold mb-4">Authentication Successful!</h1>
      <button id="return-button">Return to Wager App</button>
    </div>`;
  $('body').append(mainContent);

  // Add the script tag to redirect to the homepage
  const scriptContent = `
    const authUser = ${JSON.stringify(data.user)};
    const jwtToken = ${JSON.stringify(data.token)};
    const twoFactorAuth = ${JSON.stringify(data.twoFactorAuth)};
    const redirectUrl = ${JSON.stringify(data.redirectUrl || '/')};

    console.log('User', authUser);
    console.log('JWT', jwtToken);
    console.log('2FA', twoFactorAuth);
    console.log('Redirect URL', redirectUrl);
    
    const returnButton = document.getElementById("return-button");    
    returnButton.addEventListener("click", () => {
      window.location.href = redirectUrl;
    });
  `;

  // Create a script element and append to the body
  const scriptElement = $('<script>')
    .html(scriptContent)
    .attr('nonce', `${data.nonce}`);
  $('body').append(scriptElement);

  return $.html();
}
