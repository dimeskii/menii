// Offline safety net only — the live menu now comes from Supabase (see
// loadMenuItems() in script.js). This file is what the site falls back to
// if the Supabase fetch fails or supabase-config.js hasn't been filled in
// yet, so a broken connection never means a blank menu page. It is NOT
// read once Supabase is working; edit prices/dishes in the admin page or
// the Supabase table instead, not here. Prices are in Macedonian denari (ден).

const FALLBACK_MENU_ITEMS = {
  food: {
    popular: [
      { name: "Pinsa Ham", price: 320, description: "Quests favourite - comes with spicy peppers" },
      { name: "Cheeseburger", price: 280, description: "Customer favourite - juicy beef, cheddar, lettuce & house sauce" },
      { name: "Chicken Wrap", price: 240, description: "Loaded with crispy chicken, fresh veggies & creamy sauce" },
      { name: "Loaded Fries", price: 220, description: "Crispy fries topped with cheese, bacon & special sauce" },
      { name: "Chicken Wings", price: 260, description: "Crispy wings tossed in your choice of spicy or BBQ sauce" },
      { name: "Margherita Pizza", price: 320, description: "Classic favourite - tomato sauce, mozzarella & fresh basil" },
    ],
    pizza: [ 
      { name: "Margherita", price: 320, description: "Classic tomato sauce, mozzarella, fresh basil & olive oil", }, 
      { name: "Pepperoni", price: 350, description: "Tomato sauce, mozzarella & spicy pepperoni", }, 
      { name: "Prosciutto & Mushroom", price: 380, description: "Mozzarella, prosciutto, mushrooms & tomato sauce", }, 
      { name: "Four Cheese", price: 390, description: "Mozzarella, gorgonzola, parmesan & cheddar", }, 
      { name: "Diavola", price: 370, description: "Spicy salami, mozzarella, tomato sauce & chili peppers", }, 
      { name: "Ham & Olives", price: 350, description: "Mozzarella, ham, black olives & tomato sauce", }, 
    ], 
    hamburgers: [ 
      { name: "Classic Cheeseburger", price: 280, description: "Beef patty, cheddar, lettuce, tomato, onion & house sauce", }, 
      { name: "Bacon Burger", price: 320, description: "Beef patty, crispy bacon, cheddar, lettuce & BBQ sauce", },
      { name: "BBQ Double Burger", price: 380, description: "Two beef patties, cheddar, crispy onions & smoky BBQ sauce", },
      { name: "Crispy Chicken Burger", price: 290, description: "Crispy chicken fillet, lettuce, tomato & creamy garlic sauce", }, 
      { name: "Spicy Chicken Burger", price: 300, description: "Crispy chicken, jalapeños, cheddar & spicy house sauce", }, 
      { name: "Mushroom Swiss Burger", price: 330, description: "Beef patty, sautéed mushrooms, Swiss cheese & house sauce", },
    ],
  },

  drinks: {
    popular: [
      { name: "Cappuccino", price: 120, description: "Rich espresso topped with steamed milk foam" },
      { name: "Iced Latte", price: 140, description: "Smooth espresso over cold milk and ice" },
      { name: "Mojito", price: 280, description: "White rum, fresh mint, lime & soda" },
      { name: "Hot Chocolate", price: 160, description: "Rich Belgian chocolate topped with cream" },
    ],
    coffee: [
      { name: "Espresso", price: 90, description: "Short, strong & straight to the point" },
      { name: "Americano", price: 100, description: "Espresso lengthened with hot water" },
      { name: "Cappuccino", price: 120, description: "Rich espresso topped with steamed milk foam" },
      { name: "Flat White", price: 130, description: "Double espresso with velvety micro-foam" },
      { name: "Macchiato", price: 110, description: 'Espresso "stained" with a touch of foam' },
      { name: "Iced Latte", price: 140, description: "Smooth espresso over cold milk and ice" },
    ],
    cocktails: [
      { name: "Mojito", price: 280, description: "White rum, fresh mint, lime & soda" },
      { name: "Aperol Spritz", price: 300, description: "Aperol, prosecco & a splash of soda" },
      { name: "Margarita", price: 290, description: "Tequila, triple sec & fresh lime" },
      { name: "Gin & Tonic", price: 270, description: "Premium gin with a botanical tonic" },
      { name: "Negroni", price: 310, description: "Gin, vermouth & Campari, stirred not shaken" },
      { name: "Piña Colada", price: 300, description: "Rum, coconut cream & pineapple juice" },
    ],
  },
};

// Lets admin.js tell whether this file still matches the live menu, without
// downloading and diffing the whole thing — see "Offline backup" in the
// admin page. Only meaningful there; script.js never reads this.
// Regenerate both together from the admin page's "Download updated backup
// file" button whenever the menu changes — never hand-edit this value.
const FALLBACK_MENU_HASH = "8d16a570";
