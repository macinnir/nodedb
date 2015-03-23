# test sql

# create test database
drop database if exists testDb; 
create database testDb;
create table testDb.testTable(
	TestTableId int unsigned not null primary key auto_increment, 
	foo varchar(64), 
	bar int unsigned not null,
	LastUpdated timestamp default CURRENT_TIMESTAMP on update CURRENT_TIMESTAMP,
	DateCreated datetime, 
	IsDeleted tinyint unsigned not null default 0, 
	IsActive tinyint unsigned not null default 0
);
insert into testDb.testTable (foo, bar) values 
	('footest1', 1), 
	('footest2', 2), 
	('footest3', 3), 
	('footest4', 4), 
	('footest5', 5), 
	('footest6', 6), 
	('footest7', 7), 
	('footest8', 8), 
	('footest9', 9), 
	('footest10', 10)
;
# create test user 
drop user 'testUser'@'localhost'; 
create user 'testUser'@'localhost' identified by '1234';
grant all on testDb.* TO 'testUser'@'localhost';
