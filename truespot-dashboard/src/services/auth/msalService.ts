import 'server-only'
import { ConfidentialClientApplication } from '@azure/msal-node'
import { MSAL_AUTHORITY_BASE, POWERBI_API_SCOPE } from '@/constants/api'

let client: ConfidentialClientApplication | null = null

function getClient(): ConfidentialClientApplication {
  if (client) return client

  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env

  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error(
      'Missing Azure credentials. Ensure AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET are set in .env.local'
    )
  }

  client = new ConfidentialClientApplication({
    auth: {
      clientId: AZURE_CLIENT_ID,
      clientSecret: AZURE_CLIENT_SECRET,
      authority: `${MSAL_AUTHORITY_BASE}/${AZURE_TENANT_ID}`,
    },
  })

  return client
}

export async function getAccessToken(): Promise<string> {
  const result = await getClient().acquireTokenByClientCredential({
    scopes: [POWERBI_API_SCOPE],
  })

  if (!result?.accessToken) {
    throw new Error('MSAL returned no access token')
  }

  return result.accessToken
}
