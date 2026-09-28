# anomaly-ales
Brewery website with online store


## SETUP
I originally built this backend to work with a JSON data file with the code 90% completed by me without help.
Now I have updated it to be more realistic.
The backend only site here is an online store, setup with a database in neon.  it is for beer and some merchandise.
Orders can be placed.  the products ordered are validated in many different ways prior to creating an order, storing the ordered items and updating inventory.
there is an admin section to PATCH/UPDATE and DELETE handlers to update and remove products as well as a POST inventory where new items can be added to the database.
A GET handler grabs available items to be displayed on the frontend.

inside the handlers SQL querys send querys to the database telling it what action to take.

### Future plans
I plan to add the entire frontend to the store including the admin dashboard for updating items.
I also may want to update the hanndlers to handle the requests differently for example the current delete 
handler only deletes 1 item at a time.
