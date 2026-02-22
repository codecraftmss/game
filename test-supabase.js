import { supabase } from './src/integrations/supabase/client.js';

async function testSupabaseConnection() {
    console.log('🔍 Testing Supabase Connection...\n');

    // Test 1: Check if Supabase client is initialized
    console.log('1. Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
    console.log('2. API Key exists:', !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

    // Test 2: Try to query profiles table
    console.log('\n3. Testing database connection...');
    try {
        const { data, error } = await supabase.from('profiles').select('count');
        if (error) {
            console.error('❌ Database Error:', error.message);
            console.error('   This likely means the migration has NOT been run yet!');
        } else {
            console.log('✅ Database connected! Profiles table exists.');
        }
    } catch (err) {
        console.error('❌ Connection Error:', err.message);
    }

    // Test 3: Try to sign up with a test user
    console.log('\n4. Testing signup...');
    try {
        const testEmail = `test${Date.now()}@royalstar.example.com`;
        const { data, error } = await supabase.auth.signUp({
            email: testEmail,
            password: 'Test123456!',
            options: {
                data: { name: 'Test User', phone: '+1234567890' }
            }
        });

        if (error) {
            console.error('❌ Signup Error:', error.message);
            if (error.message.includes('invalid')) {
                console.error('   Email format is being rejected by Supabase');
                console.error('   You need to configure Supabase email settings');
            }
        } else {
            console.log('✅ Signup works! User created:', data.user?.id);
            // Clean up
            await supabase.auth.signOut();
        }
    } catch (err) {
        console.error('❌ Signup Error:', err.message);
    }

    console.log('\n✅ Test complete!');
}

testSupabaseConnection();
