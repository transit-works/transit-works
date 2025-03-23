'use client';
import { useState, useRef, useEffect } from 'react';
import { Map, NavigationControl, useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import { CylinderGeometry } from '@luma.gl/engine';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Map.css';
import { fetchFromAPI } from '@/utils/api';
import useBusAnimation from './hooks/useBusAnimation';
import useMapLayers from './hooks/useMapLayers';
import MapControls from './controls/MapControls';
import ParametersPopup from './controls/ParametersPopup';
import InfoPanel from './ui/InfoPanel';
import OptimizedBanner from './ui/OptimizedBanner';
import RouteStopsCarousel from './ui/RouteStopsCarousel';
import { getInitialViewState } from './utils/mapUtils';
import RouteColorLegend from './ui/RouteColorLegend';

// Create the overlay for Deck.gl layers
function DeckGLOverlay(props) {
  const overlay = useControl(() => new DeckOverlay(props));
  overlay.setProps(props);
  return null;
}

// Create a bus mesh using CylinderGeometry
const busMesh = new CylinderGeometry({
  radius: 0.5,
  height: 1,
  nradial: 32,
  topCap: true,
  bottomCap: true,
});

const busScale = [8, 4, 8];

function TransitMap({ 
  data, 
  selectedRoute: propsSelectedRoute, 
  setSelectedRoute: propsSetSelectedRoute, 
  selectedRoutes,
  setSelectedRoutes,
  optimizedRoutesData,
  optimizedRoutes, 
  resetOptimization,
  useLiveOptimization,
  setUseLiveOptimization,
  isOptimizing,
  optimizationProgress,
  currentEvaluation,
  onOptimize,
  optimizationError,
  mapStyle,
  show3DRoutes,
  useRandomColors,
  showPopulationHeatmap,
  showCoverageHeatmap,
  multiSelectMode,
  setMultiSelectMode,
  acoParams,
  setAcoParams,
  setIsRouteCarouselVisible,
  city,
  colorByRouteType,
}) {
  const mapRef = useRef(null);
  
  // State management
  const [initialViewState] = useState(getInitialViewState(city));
  const [popupInfo, setPopupInfo] = useState(null);
  const [routeColorMap, setRouteColorMap] = useState({});
  const [ridershipData, setRidershipData] = useState(null);
  const [optRidershipData, setOptRidershipData] = useState(null);
  const [populationData, setPopulationData] = useState(null);
  const [localSelectedRoute, setLocalSelectedRoute] = useState(null);
  const [localSelectedRoutes, setLocalSelectedRoutes] = useState(new Set());
  const [panelOpen, setPanelOpen] = useState(true);
  const [showParametersPopup, setShowParametersPopup] = useState(false);
  const [showOptimizedBanner, setShowOptimizedBanner] = useState(false);
  const [collapsedBanner, setCollapsedBanner] = useState(false);
  const [showColorLegend, setShowColorLegend] = useState(true);
  
  // Use either props or local state
  const selectedRoute = propsSelectedRoute || localSelectedRoute;
  const setSelectedRoute = propsSetSelectedRoute || setLocalSelectedRoute;
  const effectiveSelectedRoutes = selectedRoutes || localSelectedRoutes;
  const effectiveSetSelectedRoutes = setSelectedRoutes || setLocalSelectedRoutes;
  
  // Data filtering functions
  const getFilteredData = () => {
    const filteredFeatures = data.features.filter(feature => {
      if (feature.geometry.type === 'Point') return true;
      return !optimizedRoutes.has(feature.properties.route_id);
    });
    
    const selectedRouteObject = selectedRoute
      ? data.features.find((feature) => feature.properties.route_id === selectedRoute)
      : null;
    
    return multiSelectMode
      ? { ...data, features: filteredFeatures }
      : (selectedRouteObject
        ? {
            ...data,
            features: data.features.filter(
              (feature) =>
                feature.properties.route_id === selectedRoute ||
                (feature.properties.stop_id &&
                  selectedRouteObject.properties.route_stops &&
                  selectedRouteObject.properties.route_stops.includes(feature.properties.stop_id))
            ),
          }
        : { ...data, features: filteredFeatures });
  };
  
  const getFilteredOptimizedData = () => {
    const selectedRouteObjectOptimized = selectedRoute && optimizedRoutesData
      ? optimizedRoutesData.features.find((feature) => feature.properties.route_id === selectedRoute)
      : null;
    
    return multiSelectMode
      ? optimizedRoutesData
      : (selectedRouteObjectOptimized && optimizedRoutesData
          ? {
              ...optimizedRoutesData,
              features: optimizedRoutesData.features.filter(
                (feature) =>
                  feature.properties.route_id === selectedRoute ||
                  (feature.properties.stop_id &&
                    selectedRouteObjectOptimized.properties.route_stops &&
                    selectedRouteObjectOptimized.properties.route_stops.includes(feature.properties.stop_id))
              ),
            }
          : (selectedRoute ? null : optimizedRoutesData));
  };

  // Fetch data and handle interactions
  const fetchRidershipData = async (routeId) => {
    if (!routeId) return;
    
    try {
      const data = await fetchFromAPI(`/evaluate-route/${routeId}`);
      setRidershipData(data.ridership);
      setOptRidershipData(data.opt_ridership);
    } catch (error) {
      console.error('Error fetching ridership data:', error);
      setRidershipData(null);
      setOptRidershipData(null);
    }
  };

  const fetchPopulationData = async () => {
    try {
      const data = await fetchFromAPI('/grid');
      setPopulationData(data);
    } catch (error) {
      console.error('Error fetching population data:', error);
      setPopulationData(null);
    }
  };

  const handleMapLoad = () => {
    const map = mapRef.current.getMap();
    requestAnimationFrame(() => {
      map.once('idle', () => {
        document.body.classList.add('ready');
      });
      map.easeTo({
        pitch: 45,
        bearing: -10,
        duration: 2000,
        zoom: map.getZoom() + 0.1,
      });
    });
  };

  const handleClick = (info) => {
    if (!info || !info.object) return;
    const { type } = info.object.geometry;
  
    if (type !== 'Point') {
      const routeId = info.object.properties.route_id;
  
      if (multiSelectMode) {
        // Toggle route in multi-select mode
        effectiveSetSelectedRoutes((prevSelectedRoutes) => {
          const newSelectedRoutes = new Set(prevSelectedRoutes);
          if (newSelectedRoutes.has(routeId)) {
            newSelectedRoutes.delete(routeId);
          } else {
            newSelectedRoutes.add(routeId);
          }
          return newSelectedRoutes;
        });
        setSelectedRoute(routeId);
      } else {
        // Single select mode
        const isCurrentlySelected = selectedRoute === routeId;
        if (isCurrentlySelected) {
          setSelectedRoute(null);
          effectiveSetSelectedRoutes(new Set());
          setShowOptimizedBanner(false); // Hide banner when deselecting
        } else {
          setSelectedRoute(routeId);
          effectiveSetSelectedRoutes(new Set([routeId]));
          setShowOptimizedBanner(optimizedRoutes.has(routeId)); // Show banner if optimized route
        }
      }
  
      fetchRidershipData(routeId);
    }
  
    // Set popup info
    if (!multiSelectMode || type === 'Point') {
      setPopupInfo({
        coordinates: info.coordinate,
        properties: info.object.properties,
        type,
      });
    }
  };

  const toggleRandomColors = () => {
    const newColorMap = {};
    getFilteredData().features
      .filter(feature => feature.geometry.type === 'LineString')
      .forEach(feature => {
        const routeId = feature.properties.route_id;
        newColorMap[routeId] = [
          Math.floor(Math.random() * 156) + 100,
          Math.floor(Math.random() * 156) + 100,
          Math.floor(Math.random() * 156) + 100,
          180
        ];
      });
    setRouteColorMap(newColorMap);
  };

  const togglePanel = () => {
    setPanelOpen(!panelOpen);
  };

  const handleToggleRandomColors = () => {
    toggleRandomColors();
  };

  // Use custom hooks
  const { busPositions } = useBusAnimation({
    selectedRoute,
    multiSelectMode,
    effectiveSelectedRoutes,
    data,
    optimizedRoutes,
    optimizedRoutesData
  });

  const layers = useMapLayers({
    filteredData: getFilteredData(),
    filteredOptimizedData: getFilteredOptimizedData(),
    busPositions,
    show3DRoutes,
    mapStyle,
    routeColorMap,
    multiSelectMode,
    effectiveSelectedRoutes,
    useRandomColors,
    optimizedRoutes,
    showPopulationHeatmap,
    populationData,
    onClick: handleClick,
    busMesh,
    busScale,
    colorByRouteType,
  });

  // Effects
  useEffect(() => {
    fetchPopulationData();
  }, []);

  useEffect(() => {
    if (selectedRoute) {
      fetchRidershipData(selectedRoute);
    }
  }, [selectedRoute, optimizedRoutes]);

  useEffect(() => {
    if (selectedRoute && !multiSelectMode) {
      // Find route in original data
      let routeFeature = data.features.find(
        feature => feature.properties.route_id === selectedRoute &&
                  feature.geometry.type === 'LineString'
      );
      
      // If not found in original data and we have optimized data, check there
      if (!routeFeature && optimizedRoutesData) {
        routeFeature = optimizedRoutesData.features.find(
          feature => feature.properties.route_id === selectedRoute &&
                    feature.geometry.type === 'LineString'
        );
      }
      
      if (routeFeature) {
        setPopupInfo({
          coordinates: routeFeature.geometry.coordinates[0],
          properties: routeFeature.properties,
          type: 'LineString'
        });
        fetchRidershipData(selectedRoute);
      }
    } else if (!multiSelectMode) {
      setPopupInfo(null);
    }
  }, [selectedRoute, multiSelectMode, data, optimizedRoutesData]);

  // Add the Escape key functionality here
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (selectedRoute) {
          setSelectedRoute(null);
          effectiveSetSelectedRoutes(new Set());
          setShowOptimizedBanner(false);
          setPopupInfo(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedRoute, setSelectedRoute, effectiveSetSelectedRoutes, setShowOptimizedBanner, setPopupInfo]);

  useEffect(() => {
    if (useRandomColors) {
      toggleRandomColors();
    }
  }, [useRandomColors]);

  useEffect(() => {
    if (selectedRoute || (multiSelectMode && effectiveSelectedRoutes.size > 0) || popupInfo) {
      setShowColorLegend(false);
    } else {
      // Only show legend if colorByRouteType is enabled
      setShowColorLegend(colorByRouteType);
    }
  }, [selectedRoute, multiSelectMode, effectiveSelectedRoutes, popupInfo, colorByRouteType]);

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        onLoad={handleMapLoad}
      >
        <DeckGLOverlay layers={layers} />
        <NavigationControl position="top-right" />
        
        <InfoPanel 
          popupInfo={popupInfo} 
          setPopupInfo={setPopupInfo} 
          optimizedRoutes={optimizedRoutes}
          ridershipData={ridershipData}
          optRidershipData={optRidershipData}
        />
        
        <OptimizedBanner 
          isVisible={showOptimizedBanner}
          selectedRoute={selectedRoute}
          collapsedBanner={collapsedBanner}
          setCollapsedBanner={setCollapsedBanner}
        />
        
        <button
          className={`absolute bottom-12 ${panelOpen ? 'right-72' : 'right-0'} w-8 h-12 bg-zinc-900/60 backdrop-blur-md text-white flex items-center justify-center rounded-l-md z-20 hover:bg-accent/80 hover:text-white focus:outline-none transition-all duration-300`}
          onClick={togglePanel}
          aria-label={panelOpen ? "Close panel" : "Open panel"}
        >
          {panelOpen ? '>' : '<'}
        </button>
        
        <MapControls
          open={panelOpen}
          optimizedRoutes={optimizedRoutes}
          resetOptimization={resetOptimization}
          multiSelectMode={multiSelectMode}
          setMultiSelectMode={setMultiSelectMode}
          useLiveOptimization={useLiveOptimization}
          setUseLiveOptimization={setUseLiveOptimization}
          isOptimizing={isOptimizing}
          effectiveSelectedRoutes={effectiveSelectedRoutes}
          selectedRoute={selectedRoute}
          onOptimize={onOptimize}
          fetchRidershipData={fetchRidershipData}
          setShowParametersPopup={setShowParametersPopup}
          setShowColorLegend={setShowColorLegend}
        />
      </Map>
      
      <RouteStopsCarousel
        isVisible={!!(selectedRoute && !multiSelectMode)}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        optimizedRoutes={optimizedRoutes}
        data={data}
        optimizedRoutesData={optimizedRoutesData}
        panelOpen={panelOpen}
        setPopupInfo={setPopupInfo}
        mapRef={mapRef}
        setIsRouteCarouselVisible={setIsRouteCarouselVisible}
      />
      
      <ParametersPopup
        show={showParametersPopup}
        setShow={setShowParametersPopup}
        acoParams={acoParams}
        setAcoParams={setAcoParams}
      />
      
      <RouteColorLegend 
        isVisible={showColorLegend && colorByRouteType && !selectedRoute && (!multiSelectMode || effectiveSelectedRoutes.size === 0)}
        onClose={() => setShowColorLegend(false)}
        useRandomColors={useRandomColors}
        toggleRandomColors={handleToggleRandomColors}
        data={getFilteredData()} // Pass the filtered data
      />
    </>
  );
}

export default TransitMap;
