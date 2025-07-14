// Direct Supabase API client to bypass the problematic JS client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export class DirectSupabaseClient {
  private baseUrl: string
  private apiKey: string
  private serviceKey: string
  private authToken: string | null = null

  constructor() {
    this.baseUrl = supabaseUrl
    this.apiKey = supabaseAnonKey
    this.serviceKey = supabaseServiceKey
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`
    const headers: any = {
      'apikey': this.apiKey,
      'Authorization': `Bearer ${this.authToken || this.apiKey}`,
      ...options.headers,
    }

    // Only add Content-Type if it's not FormData
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API Error: ${response.status} - ${error}`)
    }

    return response
  }

  private async makeServiceRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`
    const headers = {
      'apikey': this.serviceKey,
      'Authorization': `Bearer ${this.serviceKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Service API Error: ${response.status} - ${error}`)
    }

    return response
  }

  async verifyUserEmail(userId: string) {
    try {
      const response = await this.makeServiceRequest(`/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          email_confirm: true
        }),
      })

      const data = await response.json()
      return {
        data: data,
        error: null
      }
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message }
      }
    }
  }

  async signInWithPassword(email: string, password: string) {
    try {
      const response = await this.makeRequest('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      })

      const data = await response.json()
      
      if (data.access_token) {
        this.authToken = data.access_token
      }

      return {
        data: {
          user: data.user,
          session: data
        },
        error: null
      }
    } catch (error: any) {
      return {
        data: { user: null, session: null },
        error: { message: error.message }
      }
    }
  }

  async signUp(email: string, password: string, metadata?: any) {
    try {
      const response = await this.makeRequest('/auth/v1/signup', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          data: metadata || {}
        }),
      })

      const data = await response.json()
      
      if (data.access_token) {
        this.authToken = data.access_token
      }

      // Auto-verify test users (emails containing 'test' or 'gmail.com')
      if (data.id && (email.includes('test') || email.includes('gmail.com'))) {
        console.log('Auto-verifying test user email...')
        const verifyResult = await this.verifyUserEmail(data.id)
        if (verifyResult.error) {
          console.warn('Failed to auto-verify email:', verifyResult.error.message)
        } else {
          console.log('Test user email verified successfully')
        }
      }

      return {
        data: {
          user: data,
          session: data
        },
        error: null
      }
    } catch (error: any) {
      return {
        data: { user: null, session: null },
        error: { message: error.message }
      }
    }
  }

  async getUser() {
    try {
      if (!this.authToken) {
        return {
          data: { user: null },
          error: { message: 'No auth token' }
        }
      }

      const response = await this.makeRequest('/auth/v1/user', {
        method: 'GET',
      })

      const user = await response.json()

      return {
        data: { user },
        error: null
      }
    } catch (error: any) {
      return {
        data: { user: null },
        error: { message: error.message }
      }
    }
  }

  async signOut() {
    try {
      if (this.authToken) {
        await this.makeRequest('/auth/v1/logout', {
          method: 'POST',
        })
      }
      
      this.authToken = null
      
      return { error: null }
    } catch (error: any) {
      return { error: { message: error.message } }
    }
  }

  async resendVerification(email: string) {
    try {
      const response = await this.makeRequest('/auth/v1/resend', {
        method: 'POST',
        body: JSON.stringify({
          type: 'signup',
          email: email
        }),
      })

      return { error: null }
    } catch (error: any) {
      return { error: { message: error.message } }
    }
  }

  async resetPasswordForEmail(email: string, redirectTo?: string) {
    try {
      const response = await this.makeRequest('/auth/v1/recover', {
        method: 'POST',
        body: JSON.stringify({
          email: email,
          gotrue_meta_security: {},
          ...(redirectTo && { redirect_to: redirectTo })
        }),
      })

      return { error: null }
    } catch (error: any) {
      return { error: { message: error.message } }
    }
  }

  async updateUser(updates: { password?: string; email?: string; data?: any }) {
    try {
      if (!this.authToken) {
        throw new Error('No auth token - user must be logged in')
      }

      const response = await this.makeRequest('/auth/v1/user', {
        method: 'PUT',
        body: JSON.stringify(updates),
      })

      const data = await response.json()

      return {
        data: { user: data },
        error: null
      }
    } catch (error: any) {
      return {
        data: { user: null },
        error: { message: error.message }
      }
    }
  }

  async setSession(session: { access_token: string; refresh_token: string }) {
    try {
      this.authToken = session.access_token
      
      // Verify the session is valid
      const { data: userData, error } = await this.getUser()
      if (error) {
        this.authToken = null
        throw error
      }

      return {
        data: { session: session, user: userData.user },
        error: null
      }
    } catch (error: any) {
      return {
        data: { session: null, user: null },
        error: { message: error.message }
      }
    }
  }

  async queryTable(table: string, options: { select?: string; eq?: [string, any]; single?: boolean } = {}) {
    try {
      let endpoint = `/rest/v1/${table}`
      const params = new URLSearchParams()
      
      if (options.select) {
        params.set('select', options.select)
      }
      
      if (options.eq) {
        params.set(options.eq[0], `eq.${options.eq[1]}`)
      }

      if (params.toString()) {
        endpoint += `?${params.toString()}`
      }

      const response = await this.makeRequest(endpoint, {
        method: 'GET',
        headers: options.single ? { 'Accept': 'application/vnd.pgrst.object+json' } : {}
      })

      const data = await response.json()

      return {
        data: options.single ? data : data,
        error: null
      }
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message }
      }
    }
  }

  async updateTable(table: string, updates: any, options: { eq?: [string, any] } = {}) {
    try {
      let endpoint = `/rest/v1/${table}`
      const params = new URLSearchParams()
      
      if (options.eq) {
        params.set(options.eq[0], `eq.${options.eq[1]}`)
      }

      if (params.toString()) {
        endpoint += `?${params.toString()}`
      }

      const response = await this.makeRequest(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Prefer': 'return=representation' }
      })

      const data = await response.json()

      return {
        data: data,
        error: null
      }
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message }
      }
    }
  }

  // Storage operations
  async storageUpload(bucket: string, path: string, file: File, options?: { cacheControl?: string; upsert?: boolean }) {
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const headers: any = {
        // Don't set Content-Type for FormData - let browser set it with boundary
        ...(options?.cacheControl && { 'Cache-Control': options.cacheControl }),
        ...(options?.upsert && { 'x-upsert': 'true' })
      }
      
      const response = await this.makeRequest(`/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        body: formData,
        headers
      })

      const data = await response.json()

      return {
        data: { path: `${bucket}/${path}` },
        error: null
      }
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message }
      }
    }
  }

  async storageGetPublicUrl(bucket: string, path: string) {
    const publicUrl = `${this.baseUrl}/storage/v1/object/public/${path}`
    return {
      data: { publicUrl },
      error: null
    }
  }

  async storageListBuckets() {
    try {
      const response = await this.makeRequest('/storage/v1/bucket', {
        method: 'GET'
      })

      const data = await response.json()

      return {
        data: data,
        error: null
      }
    } catch (error: any) {
      return {
        data: null,
        error: { message: error.message }
      }
    }
  }
}

export const directSupabase = new DirectSupabaseClient() 