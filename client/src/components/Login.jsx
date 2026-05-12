import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await login('metehan ay', password);
        if (!result.success) {
            setError(result.message);
        }
        setLoading(false);
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="logo-icon">OSS</div>
                    <h1>Servis Helper</h1>
                    <p>Hoş geldin, <strong>Metehan Ay</strong></p>
                    <p style={{ marginTop: '5px' }}>Devam etmek için şifreni gir</p>
                </div>
                
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label>Şifre</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••"
                            autoFocus
                            required
                        />
                    </div>

                    {error && <div className="login-error">{error}</div>}

                    <button type="submit" className="login-btn" disabled={loading}>
                        {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                    </button>
                </form>
                
                <div className="login-footer">
                    <p>© 2026 OSS Services Helper</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
