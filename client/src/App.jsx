// src/App.jsx
import React from "react";
import TVChart from "./components/TVChart";
import ChartDraw from "./components/ChartDraw";

export default function App() {
  const year = new Date().getFullYear();

  return (
    <div>
      <div>
        <h1>
          <a
            href="https://finshard.com"
            style={{ color: "#007bff", textDecoration: "none" }}
          >
            Finshard
          </a>
        </h1>
      </div>
      <ChartDraw />
    </div>
  );
}
