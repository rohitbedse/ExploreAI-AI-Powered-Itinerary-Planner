"""Wire the deterministic planner from Settings (one shared httpx client carries the User-Agent)."""

import httpx

from app.config import Settings
from app.schemas.plans import TravelMode
from app.services.planning.builder import DeterministicPlanBuilder
from app.services.planning.geocoding import PhotonGeocoder
from app.services.planning.places import OverpassClient
from app.services.planning.routing import Endpoint, OsrmRouter, TravelService


def build_plan_builder(settings: Settings, client: httpx.AsyncClient) -> DeterministicPlanBuilder:
    timeout, retries = settings.http_timeout_seconds, settings.http_max_retries
    endpoints: dict[TravelMode, Endpoint] = {}
    if settings.osrm_url:
        endpoints["drive"] = Endpoint(settings.osrm_url, "driving")
    if settings.osrm_walk_url:
        endpoints["walk"] = Endpoint(settings.osrm_walk_url, settings.osrm_walk_profile)
    if settings.osrm_bike_url:
        endpoints["bike"] = Endpoint(settings.osrm_bike_url, settings.osrm_bike_profile)
    router = OsrmRouter(endpoints, client, timeout_s=timeout, max_retries=retries)
    return DeterministicPlanBuilder(
        PhotonGeocoder(settings.photon_url, client, timeout_s=timeout, max_retries=retries),
        OverpassClient(
            settings.overpass_url,
            client,
            timeout_s=timeout,
            max_retries=retries,
            max_elements=settings.overpass_max_elements,
        ),
        TravelService(router),
        utc_offset_min=settings.plan_utc_offset_minutes,
    )
