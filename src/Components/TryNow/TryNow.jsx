import React, { useState, useEffect } from "react";
import VirtualTryOn from "./VirtualTryOn";

const TryNow = ({ onClose, category, image }) => {
  const [isStreaming, setIsStreaming] = useState(false);

  var category = category.toLowerCase()
  useEffect(() => {
    console.log(image);
    
    setIsStreaming(true);
  }, [category]); // Dependency on category to re-trigger the effect when it changes

  const stopStreaming = async () => {
    onClose()
    setIsStreaming(false);
  };

  return (
    <div className="overflow-hidden">
      {isStreaming ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="relative w-9/12 h-11/12 max-w-[690px] max-h-3xl bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">
              Virtual Try-On
            </h2>
            <p className="text-lg text-gray-500 text-center mb-6">
              Try on your favorite {category} design
            </p>

            <div>
              <VirtualTryOn category={category} image={image}/>
            </div>
            <button
              className="absolute top-4 right-4 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition"
              onClick={stopStreaming}
            >
              ✖
            </button>
          </div>
        </div>
      ) : (
        <p className="text-lg text-gray-600 text-center"></p>
      )}
    </div>
  );
};

export default TryNow;
