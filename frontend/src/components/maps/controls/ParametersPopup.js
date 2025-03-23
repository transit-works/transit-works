import React, { useState, useEffect } from 'react';

function ParametersPopup({ show, setShow, acoParams, setAcoParams }) {
  const [initialAcoParams, setInitialAcoParams] = useState(acoParams);
  const [parametersPopupErrors, setParametersPopupErrors] = useState([]);

  useEffect(() => {
    setInitialAcoParams(acoParams);
  }, [show, acoParams]);

  if (!show) return null;

  // Parameters with custom min, max, and type (int/decimal) for each slider
  const params = [
    { label: 'Ants', name: 'aco_num_ant', count: '20', sliderMin: 0, sliderMax: 250, type: 'int' },
    { label: 'Ant iterations', name: 'aco_max_gen', count: '200', sliderMin: 0, sliderMax: 1000, type: 'int' },
    { label: 'Iterations', name: 'max_gen', count: '4', sliderMin: 0, sliderMax: 15, type: 'int' },
    { label: 'Alpha', name: 'alpha', count: '2', sliderMin: 0, sliderMax: 50, type: 'float' },
    { label: 'Beta', name: 'beta', count: '3', sliderMin: 0, sliderMax: 50, type: 'float' },
    { label: 'Rho', name: 'rho', count: '0.1', sliderMin: 0, sliderMax: 10, type: 'float' },
    { label: 'Q', name: 'q', count: '1', sliderMin: 0, sliderMax: 50, type: 'float' },
  ];

  // Update value
  const handleChange = (name, value) => {
    setAcoParams((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Validation function to check if a value is a valid number
  const validateParams = () => {
    let validationErrors = [];
    
    for (const param of params) {
      const value = acoParams[param.name];
      const type = param.type;

      if (value === '') {
        validationErrors.push(`${param.label} cannot be empty.`);
        continue;
      }

      if (type === 'int') {
        if (!/^\d+$/.test(value)) {
          validationErrors.push(`${param.label} must be a valid integer.`);
        }
      }

      if (type === 'float') {
        if (!/^\d*\.?\d+$/.test(value)) {
          validationErrors.push(`${param.label} must be a valid number.`);
        }
      }
    }

    setParametersPopupErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handleApply = () => {
    if (validateParams()) {
      // Proceed with apply action if validation is successful
      setShow(false);
    }
  };

  // Reset to the initial parameters on cancel or close
  const handleCancel = () => {
    setAcoParams(initialAcoParams);
    setShow(false);
    setParametersPopupErrors([]);
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-zinc-900/60 backdrop-blur-md text-white w-[600px] max-w-[90vw] rounded-lg shadow-xl border border-zinc-700">
        <div className="flex items-center justify-between border-b border-zinc-800/70 px-6 py-4">
          <h3 className="text-xl font-heading">Optimization Parameters</h3>
          <button 
            onClick={handleCancel} 
            className="text-zinc-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-2">
          {parametersPopupErrors.length > 0 && (
            <div className="bg-red-600 bg-opacity-30 border border-red-700 text-white p-4 mb-4 rounded-lg shadow-lg backdrop-blur-sm">
              <h4 className="font-bold text-lg">Error:</h4>
              <ul className="list-disc font-medium pl-7">
                {parametersPopupErrors.map((error, index) => (
                  <li key={index} className="text-sm">{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="custom-scrollbar-container custom-scrollbar min-h-[calc(100vh-525px)] max-h-[calc(100vh-525px)] w-full p-2">
            {params.map((item, index) => {
              // Use min, max, and type from params
              const { sliderMin, sliderMax, type } = item;

              // Determine the step value based on the type
              const step = type === 'float' ? 0.1 : 1;

              return (
                <div key={index} className="flex items-center justify-between mb-4">
                  <div className="flex-1 font-heading text-base text-white">{item.label}</div>

                  <div className="flex items-center space-x-2">
                    {/* Slider */}
                    <input
                      type="range"
                      min={sliderMin}
                      max={sliderMax}
                      step={step}
                      value={acoParams[item.name]}
                      onChange={(e) => handleChange(item.name, e.target.value)}
                      className={`w-96 h-2 rounded-lg transition-all ease-in-out accent-accent`}
                      style={{
                        background: `linear-gradient(to right, ${acoParams[item.name]}%, #2e2e2e ${acoParams[item.name]}%)`,
                      }}
                    />

                    {/* Text Input */}
                    <input
                      type="text"
                      value={acoParams[item.name]}
                      onChange={(e) => handleChange(item.name, e.target.value)}
                      className="w-16 p-1 font-heading text-center text-sm text-white bg-zinc-800 rounded-md shadow-md"
                      style={{
                        WebkitAppearance: 'none',
                        MozAppearance: 'textfield',
                        appearance: 'none',
                        maxWidth: '3.5rem',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="border-t border-zinc-800/70 px-6 py-4 flex justify-end">
          <button 
            onClick={handleCancel}
            className="bg-zinc-700/80 hover:bg-zinc-600 text-white py-2 px-4 rounded mr-2"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="bg-accent hover:bg-accent/90 text-white py-2 px-4 rounded"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default ParametersPopup;