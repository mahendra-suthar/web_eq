# Mapbox Address Search Setup

The business registration form includes an address search feature powered by Mapbox Geocoding API.

## Setup Instructions

### 1. Get a Mapbox Access Token

1. Go to [Mapbox Account](https://account.mapbox.com/)
2. Sign up or log in to your Mapbox account
3. Navigate to your [Access Tokens page](https://account.mapbox.com/access-tokens/)
4. Copy your default public token, or create a new one
   - For production, create a token with restricted scopes (only Geocoding API)
   - The token should have at least `geocoding` scope enabled

### 2. Add Token to Config

Open `src/configs/config.json` and replace `YOUR_MAPBOX_ACCESS_TOKEN_HERE` with your actual token:

```json
{
  "API_URL": "http://localhost:8008/api",
  "MAPBOX_ACCESS_TOKEN": "pk.eyJ1...your-actual-token-here"
}
```

### 3. Alternative: Environment Variable

You can also use an environment variable instead:

1. Create a `.env` file in the root directory (if it doesn't exist)
2. Add:
   ```
   VITE_MAPBOX_ACCESS_TOKEN=your-mapbox-token-here
   ```
3. Make sure `.env` is in your `.gitignore` file

### 4. Usage

Once configured, the address search will:
- Show a search input at the top of the Business Location step
- Provide autocomplete suggestions as you type
- Auto-fill all address fields when you select an address
- Allow manual editing of all fields after auto-fill
- Automatically populate latitude and longitude coordinates

### Notes

- The component currently restricts searches to India (`country: "in"`). To allow worldwide searches, edit `src/components/address-search/index.tsx` and remove the `country: "in"` parameter from the API call.
- The token is loaded from `config.json` first, then falls back to environment variables.
- The component gracefully handles missing tokens with a warning message.
- Mapbox Geocoding API is used for address search, which provides autocomplete suggestions as you type.

