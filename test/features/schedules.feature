Feature: Schedules Service
  Manages vessel sailing schedules with CRUD operations for employees
  and a public read-only search API.

  Background:
    Given the schedules service is running
    And the database contains no schedules

  # --- CRUD ---

  Scenario: Employee creates a draft schedule
    When the employee sends a POST request to "/schedules" with:
      | vesselName    | Ever Given      |
      | voyageNumber  | EG-2026-14W     |
      | originPort    | CNSHA           |
      | destinationPort | NLRTM        |
      | etd           | 2026-04-15T08:00:00Z |
      | eta           | 2026-05-10T14:00:00Z |
      | cargoCutOff   | 2026-04-12T17:00:00Z |
      | docsCutOff    | 2026-04-13T12:00:00Z |
      | capacityTEU   | 200            |
    Then the response status is 201
    And the response body contains a schedule with:
      | vesselName   | Ever Given  |
      | status       | DRAFT       |
      | bookedTEU    | 0           |

  Scenario: Employee updates a draft schedule
    Given a schedule exists with voyageNumber "EG-2026-14W" and status "DRAFT"
    When the employee sends a PUT request to "/schedules/{id}" with:
      | vesselName | Ever Given 2 |
    Then the response status is 200
    And the schedule vesselName is "Ever Given 2"

  Scenario: Employee deletes a draft schedule
    Given a schedule exists with status "DRAFT"
    When the employee sends a DELETE request to "/schedules/{id}"
    Then the response status is 204
    And the schedule no longer exists

  Scenario: Employee cannot delete an OPEN schedule
    Given a schedule exists with status "OPEN"
    When the employee sends a DELETE request to "/schedules/{id}"
    Then the response status is 409

  Scenario: Public user gets a schedule by ID
    Given a schedule exists with voyageNumber "EG-2026-14W"
    When a GET request is sent to "/schedules/{id}"
    Then the response status is 200
    And the response body contains voyageNumber "EG-2026-14W"

  Scenario: Public user gets 404 for unknown schedule
    When a GET request is sent to "/schedules/00000000-0000-0000-0000-000000000000"
    Then the response status is 404

  # --- Lifecycle ---

  Scenario: Employee publishes a draft schedule (DRAFT -> OPEN)
    Given a schedule exists with status "DRAFT"
    When the employee sends a PATCH request to "/schedules/{id}/close"
    Then the response status is 200
    And the schedule status is "OPEN"

  Scenario: Employee closes an OPEN schedule (OPEN -> CLOSED)
    Given a schedule exists with status "OPEN"
    When the employee sends a PATCH request to "/schedules/{id}/close"
    Then the response status is 200
    And the schedule status is "CLOSED"

  Scenario: Employee cannot re-open a CLOSED schedule with bookings
    Given a schedule exists with status "CLOSED"
    And the schedule has 1 confirmed booking(s)
    When the employee sends a PATCH request to "/schedules/{id}/open"
    Then the response status is 409
    And the error message contains "cannot be re-opened"

  Scenario: Employee can re-open a CLOSED schedule with no bookings
    Given a schedule exists with status "CLOSED"
    And the schedule has 0 confirmed booking(s)
    When the employee sends a PATCH request to "/schedules/{id}/open"
    Then the response status is 200
    And the schedule status is "OPEN"

  # --- Public Search ---

  Scenario: Search for open schedules by origin and destination
    Given schedules exist:
      | voyage | originPort | destinationPort | status |
      | EG-001 | CNSHA      | NLRTM           | OPEN   |
      | EG-002 | CNSHA      | NLRTM           | DRAFT  |
      | EG-003 | CNSHA      | DEHAM           | OPEN   |
    When a GET request is sent to "/schedules?originPort=CNSHA&destinationPort=NLRTM"
    Then the response status is 200
    And the response contains 1 schedule(s)
    And the first schedule has voyageNumber "EG-001"

  Scenario: Public search only returns OPEN schedules
    Given schedules exist:
      | voyage | originPort | destinationPort | status |
      | EG-001 | CNSHA      | NLRTM           | OPEN   |
      | EG-002 | CNSHA      | NLRTM           | DRAFT  |
      | EG-003 | CNSHA      | NLRTM           | CLOSED |
    When a GET request is sent to "/schedules?originPort=CNSHA&destinationPort=NLRTM"
    Then the response contains exactly 1 schedule(s) with status "OPEN"

  Scenario: Employee admin view returns all schedules
    Given schedules exist:
      | voyage | originPort | destinationPort | status |
      | EG-001 | CNSHA      | NLRTM           | OPEN   |
      | EG-002 | CNSHA      | NLRTM           | DRAFT  |
      | EG-003 | CNSHA      | NLRTM           | CLOSED |
    When the authenticated employee sends a GET request to "/schedules"
    Then the response includes schedules with status "DRAFT"
    And the response includes schedules with status "OPEN"
    And the response includes schedules with status "CLOSED"

  Scenario: Search schedules by date range
    Given schedules exist:
      | voyage | etd                    | status |
      | EG-001 | 2026-04-13T08:00:00Z   | OPEN   |
      | EG-002 | 2026-04-20T08:00:00Z   | OPEN   |
      | EG-003 | 2026-05-01T08:00:00Z   | OPEN   |
    When a GET request is sent to "/schedules?departureDateFrom=2026-04-15&departureDateTo=2026-04-30"
    Then the response contains 1 schedule(s)
    And the schedule has voyageNumber "EG-002"

  Scenario: Search with no matching schedules returns empty list
    When a GET request is sent to "/schedules?originPort=CNSHA&destinationPort=NLRTM"
    Then the response status is 200
    And the response contains 0 schedule(s)

  # --- Business Rules ---

  Scenario: cargoCutOff must be before etd
    When the employee sends a POST request to "/schedules" with:
      | vesselName    | Test           |
      | voyageNumber  | BR-001         |
      | originPort    | CNSHA          |
      | destinationPort | NLRTM       |
      | etd           | 2026-04-15T08:00:00Z |
      | eta           | 2026-05-10T14:00:00Z |
      | cargoCutOff   | 2026-04-16T00:00:00Z |
      | docsCutOff    | 2026-04-13T12:00:00Z |
      | capacityTEU   | 200            |
    Then the response status is 422
    And the error message contains "cargoCutOff must be before etd"

  Scenario: eta must be after etd
    When the employee sends a POST request to "/schedules" with:
      | vesselName    | Test           |
      | voyageNumber  | BR-002         |
      | originPort    | CNSHA          |
      | destinationPort | NLRTM       |
      | etd           | 2026-04-15T08:00:00Z |
      | eta           | 2026-04-10T14:00:00Z |
      | cargoCutOff   | 2026-04-12T17:00:00Z |
      | docsCutOff    | 2026-04-13T12:00:00Z |
      | capacityTEU   | 200            |
    Then the response status is 422
    And the error message contains "eta must be after etd"

  Scenario: Computed availableCapacityTEU equals capacity minus booked
    Given a schedule exists with capacityTEU 200 and bookedTEU 45
    When a GET request is sent to "/schedules/{id}"
    Then the response body contains:
      | capacityTEU          | 200 |
      | bookedTEU            | 45  |
      | availableCapacityTEU | 155 |

  Scenario: POST /schedules validates required fields
    When the employee sends a POST request to "/schedules" with:
      | vesselName | Incomplete |
    Then the response status is 422
    And the error message contains "required"

  Scenario: GET /playground returns HTML playground page
    When a GET request is sent to "/playground"
    Then the response status is 200
    And the Content-Type header contains "text/html"
    And the response body contains "Schedules API Playground"
