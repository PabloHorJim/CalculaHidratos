import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ChefApp from './ChefApp';
import PatientApp from './components/patient/PatientApp';

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/chef/*" element={<ChefApp />} />
                <Route path="/patient/*" element={<PatientApp />} />
                {/* Redirect root to /chef for now, but could read user preference later */}
                <Route path="*" element={<Navigate to="/chef" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
