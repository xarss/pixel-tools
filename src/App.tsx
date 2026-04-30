import { BrowserRouter, Route, Routes } from "react-router-dom"

import AppLayout from "@/layouts/app-layout"
import Home from "@/pages/home"
import PaletteGenerator from "@/pages/palette-generator"

export default function App() {
  return (
    <BrowserRouter basename="/pixel-tools">
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/palette-generator" element={<PaletteGenerator />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
