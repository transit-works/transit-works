import React from 'react';
import RidershipChart from '../../visualization/RidershipChart';
import { routeTypeColorsRGB, routeTypeNames } from '../../../utils/routeTypeColors';

function InfoPanel({ popupInfo, setPopupInfo, optimizedRoutes, ridershipData, optRidershipData }) {
  if (!popupInfo) return null;

  return (
    <div className="absolute w-[17rem] top-3 right-3 z-10 bg-gradient-to-br from-zinc-900/80 to-zinc-800/70 backdrop-blur-lg text-white rounded-2xl shadow-lg border border-zinc-700/50 max-w-xs overflow-hidden transition-all duration-300 ease-in-out">
      <div className="p-4">
        {popupInfo.type === 'Point' ? (
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xl font-heading font-medium text-white flex items-center gap-2">
                <span className="flex items-center justify-center bg-blue-500/20 p-1.5 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                </span>
                Stop
              </h4>
              <button 
                onClick={() => setPopupInfo(null)}
                className="text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded-full p-1 transition-colors"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="bg-zinc-800/50 p-2 rounded-md flex items-center border-l-2 border-blue-500">
                <span className="font-medium text-zinc-300 w-16">ID:</span>
                <span className="text-white font-mono">{popupInfo.properties.stop_id}</span>
              </div>
              <div className="bg-zinc-800/50 p-2 rounded-md flex flex-col border-l-2 border-blue-500">
                <span className="font-medium text-zinc-300 mb-0.5">Name:</span>
                <span className="text-white">{popupInfo.properties.stop_name}</span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xl font-heading font-medium text-white flex items-center gap-2">
                <span className="flex items-center justify-center bg-rose-600/20 p-1.5 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}/>
                  </svg>
                </span>
                Route
                {popupInfo.properties.route_type !== undefined && (
                  <span 
                    className="ml-2 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 font-medium border-[1.5px]"
                    style={{ 
                      backgroundColor: `${routeTypeColorsRGB[popupInfo.properties.route_type] || routeTypeColorsRGB.default}10`, 
                      color: routeTypeColorsRGB[popupInfo.properties.route_type] || routeTypeColorsRGB.default,
                      borderColor: routeTypeColorsRGB[popupInfo.properties.route_type] || routeTypeColorsRGB.default
                    }}
                  >
                    <svg className="w-2.5 h-2.5" viewBox="0 0 6 6" fill="currentColor">
                      <circle cx="3" cy="3" r="3" />
                    </svg>
                    {routeTypeNames[popupInfo.properties.route_type] || routeTypeNames.default}
                  </span>
                )}
              </h4>
              <button 
                onClick={() => setPopupInfo(null)}
                className="text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded-full p-1 transition-colors"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-2 text-sm mb-3">
              <div className="bg-zinc-800/50 p-2 rounded-md flex items-center border-l-2 border-rose-600">
                <span className="font-medium font-heading text-zinc-300 w-16">ID:</span>
                <span className="text-white font-body">{popupInfo.properties.route_id}</span>
              </div>
              <div className="bg-zinc-800/50 p-2 rounded-md flex items-center border-l-2 border-rose-600">
                <span className="font-medium font-heading text-zinc-300 w-16">Name:</span>
                <span className="text-white font-body">{popupInfo.properties.route_long_name}</span>
              </div>
            </div>
            
            <div className="">
              <div className="flex items-center mb-2">
                <span className="font-medium text-zinc-300">
                  Ridership by Stop
                </span>
                {optimizedRoutes && optimizedRoutes.has(popupInfo.properties.route_id) && (
                  <span className="ml-2 bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">
                    Optimized
                  </span>
                )}
              </div>
              <RidershipChart 
                routeId={popupInfo.properties.route_id} 
                ridership={ridershipData || []}
                optRidership={optRidershipData || []}
                width={250}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default InfoPanel;